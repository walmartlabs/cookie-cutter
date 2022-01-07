import { PubSub, Subscription } from "@google-cloud/pubsub";
import {
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    IInputSource,
    ILogger,
    IMessage,
    IMetadata,
    IRequireInitialization,
    isEmbeddable,
    MessageRef,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { IGcpAuthConfiguration, IPubSubMessage, IPubSubSubscriberConfiguration } from "./index";
import { FORMAT_HTTP_HEADERS, Tracer, Tags, Span } from "opentracing";
import { AttributeNames } from "./model";

export interface IBufferToJSON {
    type: string;
    data: any[];
}

enum GooglePubSubTracingTagKeys {
    SubscriptionName = "google.pubsub.subscription_name",
}

/*
 * implements pull delivery with limits on max number of unacknowledged messages
 * that a subscriber can have in process while reading from a topic
 */
export class PubSubSource implements IInputSource, IRequireInitialization {
    private subscriber: Subscription;
    private done: boolean = false;
    private tracer: Tracer;
    private logger: ILogger;
    private messages: any[] = [];

    constructor(private readonly config: IGcpAuthConfiguration & IPubSubSubscriberConfiguration) {
        this.subscriber = new PubSub({
            projectId: this.config.projectId,
            credentials: {
                client_email: this.config.clientEmail,
                private_key: this.config.privateKey,
            },
        }).subscription(this.config.subscriptionName, {
            flowControl: {
                maxMessages: this.config.maxMsgBatchSize,
            },
        });
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.logger = context.logger;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.subscriber.on("message", (message) => this.messages.push(message));
        this.subscriber.on("error", (error) => {
            throw error;
        });

        while (!this.done) {
            if (this.messages.length !== 0) {
                const message: any = this.messages.shift();

                const { attributes, data } = this.config.preprocessor
                    ? this.config.preprocessor.process(message)
                    : (message as IPubSubMessage);

                const event_type = attributes[AttributeNames.eventType];

                let protoOrJsonPayload = data;
                if (
                    !isEmbeddable(this.config.encoder) &&
                    data.type &&
                    data.type === "Buffer" &&
                    Array.isArray(data.data)
                ) {
                    protoOrJsonPayload = data.data;
                }

                const msg = this.decode(protoOrJsonPayload, event_type);

                const spanContext = this.tracer.extract(FORMAT_HTTP_HEADERS, attributes);
                const span = this.tracer.startSpan("Processing Google PubSub Message", {
                    childOf: spanContext,
                });

                this.spanLogAndSetTags(span);

                const metadata: IMetadata = {
                    [EventSourcedMetadata.EventType]: event_type,
                    [EventSourcedMetadata.Timestamp]: attributes[AttributeNames.timestamp],
                };

                const msgRef = new MessageRef(metadata, msg, span.context());

                msgRef.once(
                    "released",
                    async (_msg: MessageRef, _value?: any, error?: Error): Promise<void> => {
                        try {
                            if (error) {
                                this.logger.error(`Unable to release message`, error, {
                                    id: message.id,
                                    subscriptionName: this.config.subscriptionName,
                                    "projectId:": this.config.projectId,
                                });
                                failSpan(span, error);
                            } else {
                                message.ack();
                                this.logger.debug(`Message processed`, {
                                    id: message.id,
                                    subscriptionName: this.config.subscriptionName,
                                    "projectId:": this.config.projectId,
                                });
                            }
                        } finally {
                            span.finish();
                        }
                    }
                );

                yield msgRef;
            }
            await sleep(50);
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
    }

    public async dispose(): Promise<void> {
        if (this.subscriber) {
            this.subscriber.removeAllListeners();
            await this.subscriber.close();
        }
    }

    private decode(payload: any, event_type: string): IMessage {
        if (isEmbeddable(this.config.encoder)) {
            return this.config.encoder.decode(
                this.config.encoder.fromJsonEmbedding(payload),
                event_type
            );
        }
        return this.config.encoder.decode(payload, event_type);
    }

    private spanLogAndSetTags(span: Span): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.MESSAGE_BUS_DESTINATION, this.config.subscriptionName);
        span.setTag(Tags.COMPONENT, "cookie-cutter-gcp");
        span.setTag(Tags.DB_INSTANCE, this.config.subscriptionName);
        span.setTag(Tags.DB_TYPE, "GooglePubSub");
        span.setTag(Tags.PEER_SERVICE, "GooglePubSub");
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        span.setTag(GooglePubSubTracingTagKeys.SubscriptionName, this.config.subscriptionName);
    }
}
