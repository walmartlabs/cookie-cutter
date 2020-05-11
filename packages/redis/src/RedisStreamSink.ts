import {
    IOutputSink,
    IPublishedMessage,
    IOutputSinkGuarantees,
    IRequireInitialization,
    IDisposable,
    IComponentContext,
    makeLifecycle,
    Lifecycle,
    IMetrics,
    failSpan,
    DefaultComponentContext,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";

import { redisClient, IRedisClient, RedisMetadata, IRedisOutputStreamOptions } from ".";
import { RedisOpenTracingTagKeys, RedisMetrics, RedisMetricResults } from "./RedisClient";

export class RedisStreamSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    public guarantees: IOutputSinkGuarantees;
    private client: Lifecycle<IRedisClient>;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "Redis Output Sink Client Call";

    constructor(private readonly config: IRedisOutputStreamOptions) {
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        this.guarantees = {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    async sink(output: IterableIterator<IPublishedMessage>, retry): Promise<void> {
        let span: Span;
        try {
            for (const msg of output) {
                span = this.tracer.startSpan(this.spanOperationName, {
                    childOf: msg.spanContext,
                });

                this.spanLogAndSetTags(span, this.config.db, this.config.writeStream);

                await this.client.xAddObject(
                    span.context(),
                    msg.message.type,
                    this.config.writeStream,
                    RedisMetadata.OutputSinkStreamKey,
                    msg.message.payload
                );

                span.finish();
            }
        } catch (err) {
            failSpan(span, err);
            span.finish();
            // bail(err);
        }
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;

        this.client = makeLifecycle(redisClient(this.config));
        await this.client.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }

    private spanLogAndSetTags(span: Span, bucket: number, streamName: string): void {
        span.log({ bucket, streamName });

        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-redis");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(RedisOpenTracingTagKeys.BucketName, bucket);
    }
}
