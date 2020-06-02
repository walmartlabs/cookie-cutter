import {
    IInputSource,
    IRequireInitialization,
    IDisposable,
    MessageRef,
    IComponentContext,
    DefaultComponentContext,
    Lifecycle,
    makeLifecycle,
    failSpan,
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";

import { IRedisInputStreamOptions, IRedisClient, IRedisMessage } from ".";
import { RedisOpenTracingTagKeys, RedisClient } from "./RedisClient";

export class RedisStreamSource implements IInputSource, IRequireInitialization, IDisposable {
    private done: boolean = false;
    private client: Lifecycle<IRedisClient>;
    private tracer: Tracer;
    private spanOperationName: string = "Redis Input Source Client Call";

    constructor(private readonly config: IRedisInputStreamOptions) {
        this.tracer = DefaultComponentContext.tracer;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        let messages: IRedisMessage[] = [];

        // On initial start attempt to fetch any messages from this consumers PEL
        const pendingMessagesForConsumer = await this.getPendingMessagesForConsumer();
        messages.push(...pendingMessagesForConsumer);

        while (!this.done) {
            // Attempt to reclaim any PEL messages that have exceeded this.config.idleTimoutMS
            const pendingMessagesForConsumerGroup = await this.getPendingMessagesForConsumerGroup();
            messages.push(...pendingMessagesForConsumerGroup);

            // Get any new messages in the consumer group to process
            const newMessages = await this.getNewMessages();
            messages.push(...newMessages);

            // Process messages to MessageRefs and yield
            for (const message of messages) {
                const span = this.tracer.startSpan(this.spanOperationName);

                this.spanLogAndSetTags(
                    span,
                    this.config.db,
                    this.config.readStream,
                    this.config.consumerGroup
                );

                const messageRef = new MessageRef(
                    { streamId: message.streamId },
                    message,
                    span.context()
                );

                messageRef.once("released", async (_, error) => {
                    try {
                        if (!error) {
                            await this.client.xAck(
                                span.context(),
                                this.config.readStream,
                                this.config.consumerGroup,
                                message.streamId
                            );
                        } else {
                            failSpan(span, error);
                        }
                    } catch (e) {
                        failSpan(span, e);
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

    stop(): Promise<void> {
        this.done = true;
        return;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;

        this.client = makeLifecycle(new RedisClient(this.config));
        await this.client.initialize(context);

        const span = this.tracer.startSpan(this.spanOperationName);

        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.readStream,
            this.config.consumerGroup
        );

        try {
            // Attempt to create stream + consumer group if they don't already exist
            await this.client.xGroup(
                span.context(),
                this.config.readStream,
                this.config.consumerGroup,
                this.config.consumerGroupStartId
            );
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
            this.config.readStream,
            this.config.consumerGroup
        );
        try {
            const messages = await this.client.xReadGroup(
                span.context(),
                this.config.readStream,
                this.config.consumerGroup,
                this.config.consumerId,
                this.config.batchSize,
                this.config.blockTimeout,
                "0" // this will retrieve all PEL messages for this consumer,
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

        this.spanLogAndSetTags(
            span,
            this.config.db,
            this.config.readStream,
            this.config.consumerGroup
        );
        try {
            const pendingMessages = await this.client.xPending(
                span.context(),
                this.config.readStream,
                this.config.consumerGroup,
                this.config.batchSize
            );

            // if there are no pending messages return early w/ an empty array
            if (pendingMessages.length < 1) {
                return [];
            }

            const pendingMessagesIds = pendingMessages.map(({ streamId }) => streamId);

            const messages = await this.client.xClaim(
                span.context(),
                this.config.readStream,
                this.config.consumerGroup,
                this.config.consumerId,
                this.config.idleTimeout,
                pendingMessagesIds
            );

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
            this.config.readStream,
            this.config.consumerGroup
        );
        try {
            const messages = await this.client.xReadGroup(
                span.context(),
                this.config.readStream,
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
        streamName: string,
        consumerGroup: string
    ): void {
        span.log({ bucket, streamName, consumerGroup });

        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-redis");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(RedisOpenTracingTagKeys.BucketName, bucket);
    }
}
