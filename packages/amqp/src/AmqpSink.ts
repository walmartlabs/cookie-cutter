import {
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    OutputSinkConsistencyLevel,
    IRequireInitialization,
    IDisposable,
    ILogger,
    IComponentContext,
    DefaultComponentContext,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";
import * as amqp from "amqplib";

export class AmqpSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    private logger: ILogger;

    constructor(private config: IAmqpConfiguration) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const queueName = this.config.queueName;
        const open = amqp.connect(`amqp://${this.config.host}`);
        const conn = await open;
        const ch = await conn.createChannel();
        const ok = await ch.assertQueue(queueName);
        if (!ok) {
            return;
        }
        for (const msg of output) {
            const payload = msg.message.payload.payload;
            this.logger.info(payload);
            ch.sendToQueue(queueName, Buffer.from(payload));
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    public async dispose(): Promise<void> {
        return;
    }
}
