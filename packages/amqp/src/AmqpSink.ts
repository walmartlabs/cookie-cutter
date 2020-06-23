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
    private conn: amqp.Connection;
    private channel: amqp.Channel;

    constructor(private config: IAmqpConfiguration) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        this.conn = await amqp.connect(`amqp://${this.config.host}`);
        this.channel = await this.conn.createChannel();
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const queueName = this.config.queueName;
        // TODO: should I move this to initialize? (If there's a delay in publishing a new sink call is made so this check will be done every time)
        const ok = await this.channel.assertQueue(queueName, { durable: true });
        this.logger.info("assertQueue", ok);

        for (const msg of output) {
            const payload = Buffer.from(this.config.encoder.encode(msg.message));
            this.logger.debug(payload.toString());
            this.channel.sendToQueue(queueName, Buffer.from(payload), {
                persistent: true,
                type: msg.message.type,
            });
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close(); // also closes channel
        }
    }
}
