import {
    IOutputSink,
    IPublishedMessage,
    IOutputSinkGuarantees,
    IRequireInitialization,
    IDisposable,
    IComponentContext,
    makeLifecycle,
    Lifecycle,
    OutputSinkConsistencyLevel,
    RetrierContext,
    IMetrics,
} from "@walmartlabs/cookie-cutter-core";

import { IRedisClient, IRedisOutputStreamOptions, RedisStreamMetadata } from ".";
import { ParserError, AggregateError } from "redis";
import { RedisClient } from "./RedisClient";

export enum RedisMetrics {
    MsgPublished = "cookie_cutter.redis_producer.msg_published",
}

export enum RedisMetricResult {
    Success = "success",
    Error = "error",
}

export class RedisStreamSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    public guarantees: IOutputSinkGuarantees;
    private client: Lifecycle<IRedisClient>;
    private metrics: IMetrics;

    constructor(private readonly config: IRedisOutputStreamOptions) {
        this.guarantees = {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    async sink(output: IterableIterator<IPublishedMessage>, retry: RetrierContext): Promise<void> {
        let writeStream = this.config.stream;
        try {
            for (const msg of output) {
                writeStream = msg.metadata[RedisStreamMetadata.Stream] || this.config.stream;

                await this.client.xAddObject(
                    msg.spanContext,
                    msg.message.type,
                    writeStream,
                    {
                        payload: this.config.payloadKey,
                        typeName: this.config.typeNameKey,
                    },
                    msg.message.payload,
                    undefined,
                    this.config.maxStreamLength
                );

                this.metrics.increment(RedisMetrics.MsgPublished, {
                    stream_name: writeStream,
                    result: RedisMetricResult.Success,
                });
            }
        } catch (err) {
            this.metrics.increment(RedisMetrics.MsgPublished, {
                stream_name: writeStream,
                result: RedisMetricResult.Error,
            });

            if (err instanceof ParserError || err instanceof AggregateError) {
                retry.bail(err);
            } else {
                throw err;
            }
        }
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.metrics = context.metrics;
        this.client = makeLifecycle(new RedisClient(this.config));
        await this.client.initialize(context);
    }

    public async dispose(): Promise<void> {
        if (this.client) {
            await this.client.dispose();
        }
    }
}
