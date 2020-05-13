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
} from "@walmartlabs/cookie-cutter-core";

import { redisClient, IRedisClient, RedisMetadata, IRedisOutputStreamOptions } from ".";
import { ParserError, AggregateError } from "redis";

export class RedisStreamSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    public guarantees: IOutputSinkGuarantees;
    private client: Lifecycle<IRedisClient>;

    constructor(private readonly config: IRedisOutputStreamOptions) {
        this.guarantees = {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    async sink(output: IterableIterator<IPublishedMessage>, retry: RetrierContext): Promise<void> {
        try {
            for (const msg of output) {
                await this.client.xAddObject(
                    msg.spanContext,
                    msg.message.type,
                    this.config.writeStream,
                    RedisMetadata.OutputSinkStreamKey,
                    msg.message.payload
                );
            }
        } catch (err) {
            if (err instanceof ParserError || err instanceof AggregateError) {
                retry.bail(err);
            } else {
                throw err;
            }
        }
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.client = makeLifecycle(redisClient(this.config));
        await this.client.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }
}
