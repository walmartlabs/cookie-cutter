import {
    IInputSource,
    IInputSourceContext,
    MessageRef,
    IMetadata,
    IMessage,
    IComponentContext,
    IRequireInitialization,
    IDisposable,
    BoundedPriorityQueue,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";
import { SpanContext } from "opentracing";
import * as amqp from "amqplib";
import { MessageClass } from "./amqp_tester";

export class AmqpSource implements IInputSource, IRequireInitialization, IDisposable {
    private pipe = new BoundedPriorityQueue<MessageRef>(100);
    private conn: amqp.Connection;

    constructor(private config: IAmqpConfiguration) {}

    public async initialize(_context: IComponentContext): Promise<void> {
        this.conn = await amqp.connect(`amqp://${this.config.host}`);
    }

    public async *start(_context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        const queueName = this.config.queueName;

        const ch = await this.conn.createChannel();
        const ok = await ch.assertQueue(queueName);

        if (!ok) {
            return;
        }

        const pipe = this.pipe;
        async function getMsg(msg: any) {
            if (msg !== null) {
                const metadata: IMetadata = { noMeta: true };
                const iMsg: IMessage = {
                    type: MessageClass.name,
                    payload: new MessageClass(msg.content.toString()),
                };
                const msgRef = new MessageRef(metadata, iMsg, new SpanContext());
                await pipe.enqueue(msgRef);
                ch.ack(msg);
            }
        }
        await ch.consume(queueName, getMsg);
        yield* this.pipe.iterate();
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close();
        }
        return;
    }

    public async stop(): Promise<void> {
        this.pipe.close();
        return;
    }
}
