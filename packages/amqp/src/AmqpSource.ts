import {
    IInputSource,
    MessageRef,
    IMetadata,
    IComponentContext,
    IRequireInitialization,
    IDisposable,
    BoundedPriorityQueue,
    ILogger,
    DefaultComponentContext,
    EncodedMessage,
    IMessage,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";
import { SpanContext } from "opentracing";
import * as amqp from "amqplib";

export class AmqpSource implements IInputSource, IRequireInitialization, IDisposable {
    private pipe = new BoundedPriorityQueue<MessageRef>(100);
    private logger: ILogger;
    private conn: amqp.Connection;
    private channel: amqp.Channel;

    constructor(private config: IAmqpConfiguration) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        const options: amqp.Options.Connect = {
            protocol: "amqp",
            hostname: this.config.host,
            port: this.config.port,
        };
        this.conn = await amqp.connect(options);
        this.channel = await this.conn.createChannel();
        await this.channel.prefetch(1); // wait until message is acked before getting new one
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        const queueName = this.config.queueName;

        const ok = await this.channel.assertQueue(queueName, { durable: true });
        this.logger.info("assertQueue", ok);

        const pipe = this.pipe;
        const ch = this.channel;
        const encoder = this.config.encoder;
        async function getMsg(msg: amqp.ConsumeMessage) {
            if (msg !== null) {
                const type = msg.properties.type;
                const metadata: IMetadata = {};
                const codedMessage: IMessage = new EncodedMessage(encoder, type, msg.content);
                const msgRef = new MessageRef(metadata, codedMessage, new SpanContext());
                await pipe.enqueue(msgRef);
                ch.ack(msg);
            }
        }
        await this.channel.consume(queueName, getMsg, { noAck: false });
        yield* this.pipe.iterate();
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close(); // also closes channel
        }
    }

    public async stop(): Promise<void> {
        this.pipe.close();
    }
}
