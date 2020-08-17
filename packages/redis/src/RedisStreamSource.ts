import {
    IInputSource,
    IRequireInitialization,
    IDisposable,
    MessageRef,
    IComponentContext,
    DefaultComponentContext,
    Lifecycle,
    makeLifecycle,
    IMetrics,
    failSpan,
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";

import {
    IRedisInputStreamOptions,
    IRedisClient,
    IRedisMessage,
    RedisStreamMetadata,
    RedisMetrics,
    RedisMetricResult,
} from ".";
import { RedisOpenTracingTagKeys, RedisClient } from "./RedisClient";

export class RedisStreamSource implements IInputSource, IRequireInitialization, IDisposable {
    private done: boolean = false;
    private client: Lifecycle<IRedisClient>;
    private tracer: Tracer = DefaultComponentContext.tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "Redis Input Source Client Call";
    private lastPendingMessagesCheck: Date | undefined;

    constructor(private readonly config: IRedisInputStreamOptions) {}

    public async *start(): AsyncIterableIterator<MessageRef> {
        // On initial start attempt to fetch any messages from this consumers PEL
        let messages = await this.getPendingMessagesForConsumer();

        while (!this.done) {
            // Attempt to reclaim any PEL messages that have exceeded this.config.idleTimeout
            if (
                this.lastPendingMessagesCheck === undefined ||
                this.lastPendingMessagesCheck.getTime() + this.config.reclaimMessageInterval <=
                    Date.now()
            ) {
                const pendingMessagesForConsumerGroup = await this.getPendingMessagesForConsumerGroup();
                messages.push(...pendingMessagesForConsumerGroup);

                // don't update if there were pending messages, try again on next
                // iteration until pending messages are drained
                if (pendingMessagesForConsumerGroup.length === 0) {
                    this.lastPendingMessagesCheck = new Date(Date.now());
                }
            }

            // Get any new messages in the consumer group to process
            const newMessages = await this.getNewMessages();
            messages.push(...newMessages);

            this.metrics.gauge(RedisMetrics.IncomingBatchSize, messages.length, {});
            // Process messages to MessageRefs and yield
            for (const message of messages) {
                const span = this.tracer.startSpan(this.spanOperationName);

                this.spanLogAndSetTags(
                    span,
                    this.config.db,
                    message.streamName,
                    this.config.consumerGroup
                );

                this.metrics.increment(RedisMetrics.MsgReceived, {
                    stream_name: message.streamName,
                    consumer_group: this.config.consumerGroup,
                });

                const messageRef = new MessageRef(
                    {
                        [RedisStreamMetadata.StreamId]: message.streamId,
                        [RedisStreamMetadata.StreamName]: message.streamName,
                    },
                    message,
                    span.context()
                );

                messageRef.once("released", async (_, error) => {
                    try {
                        if (error) throw error;

                        await this.client.xAck(
                            span.context(),
                            message.streamName,
                            this.config.consumerGroup,
                            message.streamId
                        );

                        this.metrics.increment(RedisMetrics.MsgProcessed, {
                            stream_name: message.streamName,
                            consumer_group: this.config.consumerGroup,
                            result: RedisMetricResult.Success,
                        });
                    } catch (e) {
                        failSpan(span, e);
                        this.metrics.increment(RedisMetrics.MsgProcessed, {
                            stream_name: message.streamName,
                            consumer_group: this.config.consumerGroup,
                            result: RedisMetricResult.Error,
                        });
                    } finally {
                        span.finish();
                    }
                });

                yield messageRef;
            }

            // Clear messages for next iteration
            messages = [];
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
        return;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;

        this.client = makeLifecycle(new RedisClient(this.config));
        await this.client.initialize(context);

        const span = this.tracer.startSpan(this.spanOperationName);

        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.readStreams,
            this.config.consumerGroup
        );

        try {
            // Attempt to create stream + consumer group if they don't already exist
            for (const readStream of this.config.readStreams) {
                await this.client.xGroup(
                    span.context(),
                    readStream,
                    this.config.consumerGroup,
                    this.config.consumerGroupStartId
                );
            }
        } catch (error) {
            failSpan(span, error);
            throw error;
        } finally {
            span.finish();
        }
    }

    public async dispose(): Promise<void> {
        if (this.client) {
            await this.client.dispose();
        }
    }

    private async getPendingMessagesForConsumer(): Promise<IRedisMessage[]> {
        const span = this.tracer.startSpan(this.spanOperationName);

        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.readStreams,
            this.config.consumerGroup
        );
        try {
            const messages = await this.client.xReadGroup(
                span.context(),
                this.config.readStreams.map((name) => ({ name, id: "0" })), // this will retrieve all PEL messages for this consumer
                this.config.consumerGroup,
                this.config.consumerId,
                this.config.batchSize,
                this.config.blockTimeout
            );

            return messages;
        } catch (error) {
            failSpan(span, error);
            throw error;
        } finally {
            span.finish();
        }
    }

    private async getPendingMessagesForConsumerGroup(): Promise<IRedisMessage[]> {
        const span = this.tracer.startSpan(this.spanOperationName);

        try {
            const messages = new Array<IRedisMessage>();
            for (const readStream of this.config.readStreams) {
                this.spanLogAndSetTags(span, this.config.db, readStream, this.config.consumerGroup);

                const pendingMessages = await this.client.xPending(
                    span.context(),
                    readStream,
                    this.config.consumerGroup,
                    this.config.batchSize
                );

                this.metrics.gauge(RedisMetrics.PendingMsgSize, pendingMessages.length, {
                    stream_name: readStream,
                    consumer_group: this.config.consumerGroup,
                });

                // if there are no pending messages return early w/ an empty array
                if (!pendingMessages.length) {
                    continue;
                }

                const pendingMessagesIds = pendingMessages.map(({ streamId }) => streamId);

                const claimedMessages = await this.client.xClaim(
                    span.context(),
                    readStream,
                    this.config.consumerGroup,
                    this.config.consumerId,
                    this.config.idleTimeout,
                    pendingMessagesIds
                );

                messages.push(...claimedMessages);
                this.metrics.increment(RedisMetrics.MsgsClaimed, claimedMessages.length, {
                    stream_name: readStream,
                    consumer_group: this.config.consumerGroup,
                });
            }

            return messages;
        } catch (error) {
            failSpan(span, error);
            throw error;
        } finally {
            span.finish();
        }
    }

    private async getNewMessages(): Promise<IRedisMessage[]> {
        const span = this.tracer.startSpan(this.spanOperationName);

        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.readStreams,
            this.config.consumerGroup
        );
        try {
            const messages = await this.client.xReadGroup(
                span.context(),
                this.config.readStreams.map((name) => ({ name })),
                this.config.consumerGroup,
                this.config.consumerId,
                this.config.batchSize,
                this.config.blockTimeout
            );

            return messages;
        } catch (error) {
            failSpan(span, error);
            throw error;
        } finally {
            span.finish();
        }
    }

    private spanLogAndSetTags(
        span: Span,
        bucket: number,
        streamNames: string | string[],
        consumerGroup: string
    ): void {
        span.log({ bucket, streamNames, consumerGroup });

        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-redis");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(RedisOpenTracingTagKeys.BucketName, bucket);
    }
}
