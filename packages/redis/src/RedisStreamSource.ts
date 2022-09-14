/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

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
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";

import { IRedisClient, IRedisInputStreamOptions, IRedisMessage, RedisStreamMetadata } from ".";
import { RedisOpenTracingTagKeys, RedisClient } from "./RedisClient";

export enum RedisMetrics {
    MsgReceived = "cookie_cutter.redis_consumer.input_msg_received",
    MsgProcessed = "cookie_cutter.redis_consumer.input_msg_processed",
    MsgsClaimed = "cookie_cutter.redis_consumer.input_msgs_claimed",
    PendingMsgSize = "cookie_cutter.redis_consumer.pending_msg_size",
    IncomingBatchSize = "cookie_cutter.redis_consumer.incoming_batch_size",
}

export enum RedisMetricResult {
    Success = "success",
    Error = "error",
}

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
        // these are messages that were previously read with XReadGroup by
        // this consumer group, but were not acked. This can happen on service restarts
        let streams = this.config.streams.map((name) => ({ name, id: "0" }));
        while (!this.done) {
            const span = this.tracer.startSpan(this.spanOperationName);

            this.spanLogAndSetTags(
                span,
                this.config.db,
                this.config.streams,
                this.config.consumerGroup
            );

            try {
                const messages = await this.client.xReadGroup(
                    span.context(),
                    streams,
                    this.config.consumerGroup,
                    this.config.consumerId,
                    this.config.batchSize,
                    this.config.blockTimeout,
                    this.config.payloadKey,
                    this.config.typeNameKey
                );

                if (messages.length === 0) {
                    break;
                }

                this.metrics.gauge(RedisMetrics.IncomingBatchSize, messages.length, {});
                for (const message of messages) {
                    // when calling XReadGroup again only get messages after this one
                    streams.filter((s) => s.name === message.streamName)[0].id = message.messageId;
                    yield this.createMessageRef(message, span);
                }
            } catch (e) {
                failSpan(span, e);
                throw e;
            } finally {
                span.finish();
            }
        }

        // Now start processing new messages in the stream that have not been
        // read before with XReadGroup
        streams = this.config.streams.map((name) => ({ name, id: ">" }));
        let didXReadGroup = true;
        while (!this.done) {
            const span = this.tracer.startSpan(this.spanOperationName);

            this.spanLogAndSetTags(
                span,
                this.config.db,
                this.config.streams,
                this.config.consumerGroup
            );

            try {
                let messages = [];

                // Once in a while check the PEL list for _other_ consumers
                // to reclaim orphaned messages. This can happen if a consumer dies
                // or permanently leaves the consumer groupe (e.g. scaling down to less instances)
                if (
                    this.config.reclaimMessageInterval &&
                    didXReadGroup &&
                    (this.lastPendingMessagesCheck === undefined ||
                        this.lastPendingMessagesCheck.getTime() +
                            this.config.reclaimMessageInterval <=
                            Date.now())
                ) {
                    messages = await this.getPendingMessagesForConsumerGroup(span);

                    // don't update if there were pending messages, try again on next
                    // iteration until pending messages are drained
                    if (messages.length === 0) {
                        this.lastPendingMessagesCheck = new Date(Date.now());
                        didXReadGroup = false;
                    }
                } else {
                    messages = await this.client.xReadGroup(
                        span.context(),
                        streams,
                        this.config.consumerGroup,
                        this.config.consumerId,
                        this.config.batchSize,
                        this.config.blockTimeout,
                        this.config.payloadKey,
                        this.config.typeNameKey
                    );

                    // this variable ensures that we don't get stuck in the reclaim
                    // loop due to bad timing ... ensure that at least one XReadGroup
                    // command gets interleaved after each check for pending messages
                    didXReadGroup = true;
                }

                if (messages.length > 0) {
                    this.metrics.gauge(RedisMetrics.IncomingBatchSize, messages.length, {});
                    for (const message of messages) {
                        yield this.createMessageRef(message, span);
                    }
                }
            } catch (e) {
                failSpan(span, e);
                throw e;
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
        this.logger = context.logger;

        this.client = makeLifecycle(new RedisClient(this.config));
        await this.client.initialize(context);

        const span = this.tracer.startSpan(this.spanOperationName);
        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.streams,
            this.config.consumerGroup
        );

        try {
            // Attempt to create stream + consumer group if they don't already exist
            for (const readStream of this.config.streams) {
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
                [RedisStreamMetadata.MessageId]: message.messageId,
                [RedisStreamMetadata.Stream]: message.streamName,
                [RedisStreamMetadata.ConsumerId]: this.config.consumerGroup,
            },
            message,
            span.context()
        );

        messageRef.once("released", (msg, _, err) => this.onMessageReleased(span, msg, err));
        return messageRef;
    }

    private async onMessageReleased(span: Span, msg: MessageRef, err: Error) {
        const stream = msg.metadata<string>(RedisStreamMetadata.Stream);
        const messageId = msg.metadata<string>(RedisStreamMetadata.MessageId);
        const consumerId = msg.metadata<string>(RedisStreamMetadata.ConsumerId);

        try {
            if (err) throw err;

            const count = await this.client.xAck(span.context(), stream, consumerId, messageId);
            if (count !== 1) {
                throw new Error("not found in PEL");
            }

            this.metrics.increment(RedisMetrics.MsgProcessed, {
                stream_name: stream,
                consumer_group: consumerId,
                result: RedisMetricResult.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisMetrics.MsgProcessed, {
                stream_name: stream,
                consumer_group: consumerId,
                result: RedisMetricResult.Error,
            });

            if (!err) {
                this.logger.error("failed to ack message", e, { messageId, stream, consumerId });
                throw e;
            }
        } finally {
            span.finish();
        }
    }

    private async getPendingMessagesForConsumerGroup(span: Span): Promise<IRedisMessage[]> {
        const messages = new Array<IRedisMessage>();
        for (const readStream of this.config.streams) {
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

            const pendingMessagesIds = pendingMessages.map(({ messageId }) => messageId);

            const claimedMessages = await this.client.xClaim(
                span.context(),
                readStream,
                this.config.consumerGroup,
                this.config.consumerId,
                this.config.idleTimeout,
                this.config.payloadKey,
                this.config.typeNameKey,
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
