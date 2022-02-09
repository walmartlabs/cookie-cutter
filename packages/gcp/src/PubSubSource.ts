/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { PubSub, Subscription } from "@google-cloud/pubsub";
import {
    BoundedPriorityQueue,
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    IInputSource,
    ILogger,
    IMessage,
    IMetadata,
    IMetrics,
    IRequireInitialization,
    isEmbeddable,
    MessageRef,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { IGcpAuthConfiguration, IPubSubMessage, IPubSubSubscriberConfiguration } from "./index";
import { FORMAT_HTTP_HEADERS, Tracer, Tags, Span } from "opentracing";
import {
    AttributeNames,
    PubSubMetricResults,
    PubSubMetrics,
    PubSubOpenTracingTagKeys,
} from "./model";

/*
 * implements pull delivery with limits on max number of unacknowledged messages
 * that a subscriber can have in process while reading from a topic
 */
export class PubSubSource implements IInputSource, IRequireInitialization {
    private subscriber: Subscription;
    private done: boolean = false;
    private tracer: Tracer;
    private logger: ILogger;
    private metrics: IMetrics;
    private queue: BoundedPriorityQueue<MessageRef>;

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

        this.queue = new BoundedPriorityQueue<MessageRef>(this.config.maxMsgBatchSize);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.logger = context.logger;
        this.metrics = context.metrics;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.subscriber.on("message", async (message) => {
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

            this.spanLogAndSetTags(span, this.start.name);

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
                            this.emitMetrics(event_type, PubSubMetricResults.Error);
                            failSpan(span, error);
                        } else {
                            message.ack();
                            this.logger.debug(`Message processed`, {
                                id: message.id,
                                subscriptionName: this.config.subscriptionName,
                                "projectId:": this.config.projectId,
                            });
                            this.emitMetrics(event_type, PubSubMetricResults.Success);
                        }
                    } finally {
                        span.finish();
                    }
                }
            );

            if (!this.done) {
                await this.queue.enqueue(msgRef);
            }
        });

        this.subscriber.on("error", (error) => {
            this.queue.close();
            throw error;
        });

        yield* this.queue.iterate();
    }

    public async stop(): Promise<void> {
        this.done = true;
        this.queue.close();
    }

    public async dispose(): Promise<void> {
        if (this.subscriber) {
            this.subscriber.removeAllListeners();
            await this.subscriber.close();
        }
    }

    private decode(payload: any, event_type: any): IMessage {
        if (isEmbeddable(this.config.encoder)) {
            return this.config.encoder.decode(
                this.config.encoder.fromJsonEmbedding(payload),
                event_type
            );
        }
        return this.config.encoder.decode(payload, event_type);
    }

    private spanLogAndSetTags(span: Span, funcName: string): void {
        span.log({ subscription_name: this.config.subscriptionName });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-pubSub");
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(PubSubOpenTracingTagKeys.SubscriberName, this.config.subscriptionName);
    }

    private emitMetrics(event_type: any, result: PubSubMetricResults): void {
        this.metrics.increment(PubSubMetrics.MsgSubscribed, {
            subscription_name: this.config.subscriptionName,
            event_type,
            result,
        });
    }
}
