import { PubSub, Subscription } from "@google-cloud/pubsub";
import {
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    IInputSource,
    ILogger,
    IMetadata,
    isEmbeddable,
    MessageRef,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { IGcpAuthConfiguration, IPubSubSubscriberConfiguration } from ".";
import { FORMAT_HTTP_HEADERS, Tracer, Tags } from "opentracing";
import { isArray } from "util";
import { AttributeNames } from "./PubSubSink";

interface IBufferToJSON {
    type: string;
    data: any[];
}

export enum GooglePubSubTracingTagKeys {
    SubscriptionName = "google.pubsub.subscription_name",
}

/*
 * implements pull delivery with limits on max number of unacknowledged messages
 * that a subscriber can have in process while reading from a topic
 */
export class PubSubPullSource implements IInputSource {
    private readonly MAX_MSG_BATCH_SIZE: number = 10;
    private subscriber: Subscription;
    private done: boolean = false;
    private tracer: Tracer;
    private logger: ILogger;
    private messages: any[] = [];

    constructor(private readonly config: IGcpAuthConfiguration & IPubSubSubscriberConfiguration) {
        this.config.maxMsgBatchSize = this.config.maxMsgBatchSize || this.MAX_MSG_BATCH_SIZE;

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
        // Error codes - https://cloud.google.com/pubsub/docs/reference/error-codes
        this.subscriber.on("error", async (error) => {
            this.logger.error("Subscriber ran into a error", error);
            await this.stop();
        });

        while (!this.done) {
            while (this.messages.length !== 0) {
                const message: any = this.messages.shift();

                const { attributes, data } = message as {
                    attributes: any;
                    data: IBufferToJSON | any;
                };

                const event_type = attributes[EventSourcedMetadata.EventType];

                let protoOrJsonPayload = data;
                if(!isEmbeddable(this.config.encoder) && data.type && data.type == "Buffer" && isArray(data.dat)) {
                    protoOrJsonPayload = data.data;
                }

                const msg = this.decode(protoOrJsonPayload, event_type);

                const spanContext = this.tracer.extract(FORMAT_HTTP_HEADERS, attributes);
                const span = this.tracer.startSpan("Processing Google PubSub Message", {
                    childOf: spanContext,
                });
                span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
                span.setTag(Tags.MESSAGE_BUS_DESTINATION, this.config.subscriptionName);
                span.setTag(Tags.COMPONENT, "cookie-cutter-gcp");
                span.setTag(Tags.DB_INSTANCE, this.config.subscriptionName);
                span.setTag(Tags.DB_TYPE, "GooglePubSub");
                span.setTag(Tags.PEER_SERVICE, "GooglePubSub");
                span.setTag(Tags.SAMPLING_PRIORITY, 1);
                span.setTag(GooglePubSubTracingTagKeys.SubscriptionName, this.config.subscriptionName);

                const metadata: IMetadata = {
                    [AttributeNames.contentType] : message.attributes[AttributeNames.contentType],
                    [AttributeNames.eventType] : message.attributes[AttributeNames.eventType],
                    [AttributeNames.timestamp] : message.attributes[AttributeNames.timestamp]
                };
                
                const msgRef = new MessageRef(metadata, msg, span.context());
                msgRef.once(
                    "released",
                    async (_msg: MessageRef, _value?: any, error?: Error): Promise<void> => {
                        try{
                            if (error) {
                                this.logger.error(`Unable to release message | ${error}`);
                            } else{
                                message.ack();
                                this.logger.debug(`Message processed : ${message.id}`);
                                failSpan(span, error);
                            }

                        } finally {
                            span.finish();
                        }
                    }
                );

                yield msgRef;
            }
            await sleep(100);
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
        await this.dispose();
    }

    public async dispose(): Promise<void> {
        if (this.subscriber) {
            this.subscriber.removeAllListeners();
            this.subscriber.close();
        }
    }

    private decode(payload: any, event_type: string){
        if(isEmbeddable(this.config.encoder)) {
            return this.config.encoder.decode(this.config.encoder.fromJsonEmbedding(payload), event_type);
        }
        return this.config.encoder.decode(payload, event_type);
    }
}
