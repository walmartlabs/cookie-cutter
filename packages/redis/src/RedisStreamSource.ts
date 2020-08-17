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
    ILogger,
    sleep,
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
    private metrics: IMetrics = DefaultComponentContext.metrics;
    private logger: ILogger = DefaultComponentContext.logger;
    private spanOperationName: string = "Redis Input Source Client Call";
    private lastPendingMessagesCheck: Date | undefined;

    constructor(private readonly config: IRedisInputStreamOptions) {}

    public async *start(): AsyncIterableIterator<MessageRef> {
        // On initial start attempt to fetch any messages from this consumers PEL
        // these are messages that were previously read with XGroupRead by
        // this consumer group, but were not acked. This can happen on service restarts
        const streams = this.config.readStreams.map((name) => ({ name, id: "0" }));
        while (!this.done) {
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
                    streams,
                    this.config.consumerGroup,
                    this.config.consumerId,
                    this.config.batchSize,
                    this.config.blockTimeout
                );

                if (messages.length === 0) {
                    break;
                }

                this.metrics.gauge(RedisMetrics.IncomingBatchSize, messages.length, {});
                for (const message of messages) {
                    // when calling xReadGroup again only get messages after this one
                    streams.filter((s) => s.name === message.streamName)[0].id = message.streamId;
                    yield this.createMessageRef(message, span);
                }
            } catch (e) {
                failSpan(span, e);
                this.logger.error("failed to read messages from Redis, retrying in 500ms", e);
                await sleep(500);
            } finally {
                span.finish();
            }
        }

        // Now start processing new messages in the stream that have not been
        // read before with XReadGroup
        while (!this.done) {
            const span = this.tracer.startSpan(this.spanOperationName);

            this.spanLogAndSetTags(
                span,
                this.config.db,
                this.config.readStreams,
                this.config.consumerGroup
            );

            try {
                let messages = [];

                // Once in a while check the PEL list for _other_ consumer groups
                // to reclaim orphaned messages. This can happen if a consumer dies
                // or permanently leaves the consumer groupe (e.g. scaling down to less instances)
                if (
                    this.lastPendingMessagesCheck === undefined ||
                    this.lastPendingMessagesCheck.getTime() + this.config.reclaimMessageInterval <=
                        Date.now()
                ) {
                    messages = await this.getPendingMessagesForConsumerGroup(span);

                    // don't update if there were pending messages, try again on next
                    // iteration until pending messages are drained
                    if (messages.length === 0) {
                        this.lastPendingMessagesCheck = new Date(Date.now());
                    }
                } else {
                    messages = await this.client.xReadGroup(
                        span.context(),
                        this.config.readStreams.map((name) => ({ name })),
                        this.config.consumerGroup,
                        this.config.consumerId,
                        this.config.batchSize,
                        this.config.blockTimeout
                    );
                }

                if (messages.length > 0) {
                    this.metrics.gauge(RedisMetrics.IncomingBatchSize, messages.length, {});
                    for (const message of messages) {
                        yield this.createMessageRef(message, span);
                    }
                }
            } catch (e) {
                failSpan(span, e);
                this.logger.error("failed to read messages from Redis, retrying in 500ms", e);
                await sleep(500);
            } finally {
                span.finish();
            }
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
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

    private createMessageRef(message: IRedisMessage, span: Span): MessageRef {
        this.metrics.increment(RedisMetrics.MsgReceived, {
            stream_name: message.streamName,
            consumer_group: this.config.consumerGroup,
        });

        const messageRef = new MessageRef(
            {
                [RedisStreamMetadata.StreamId]: message.streamId,
                [RedisStreamMetadata.StreamName]: message.streamName,
                [RedisStreamMetadata.ConsumerId]: this.config.consumerGroup,
            },
            message,
            span.context()
        );

        messageRef.once("released", (msg, err) => this.onMessageReleased(span, msg, err));
        return messageRef;
    }

    private async onMessageReleased(span: Span, msg: MessageRef, err: any) {
        const streamName = msg.metadata<string>(RedisStreamMetadata.StreamName);
        const streamId = msg.metadata<string>(RedisStreamMetadata.StreamId);
        const consumerGroup = msg.metadata<string>(RedisStreamMetadata.ConsumerId);

        try {
            if (err) throw err;

            await this.client.xAck(span.context(), streamName, consumerGroup, streamId);

            this.metrics.increment(RedisMetrics.MsgProcessed, {
                stream_name: streamName,
                consumer_group: consumerGroup,
                result: RedisMetricResult.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisMetrics.MsgProcessed, {
                stream_name: streamName,
                consumer_group: consumerGroup,
                result: RedisMetricResult.Error,
            });
        } finally {
            span.finish();
        }
    }

    private async getPendingMessagesForConsumerGroup(span: Span): Promise<IRedisMessage[]> {
        const messages = new Array<IRedisMessage>();
        for (const readStream of this.config.readStreams) {
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
