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

import {
    redisClient,
    IRedisClient,
    RedisMetadata,
    IRedisOutputStreamOptions,
    RedisStreamMetadata,
} from ".";
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
                const writeStream =
                    msg.metadata[RedisStreamMetadata.StreamName] || this.config.writeStream;

                await this.client.xAddObject(
                    msg.spanContext,
                    msg.message.type,
                    writeStream,
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
        if (this.client) {
            await this.client.dispose();
        }
    }
}
