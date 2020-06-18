import {
    IInputSource,
    IInputSourceContext,
    MessageRef,
    IMetadata,
    AsyncPipe,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";
import { SpanContext } from "opentracing";
import * as amqp from "amqplib";

export class AmqpSource implements IInputSource {
    private pipe = new AsyncPipe<MessageRef>();

    constructor(private config: IAmqpConfiguration) {}

    public async *start(_context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        const queueName = this.config.queueName;

        const open = amqp.connect(`amqp://${this.config.host}`);
        const conn = await open;
        const ch = await conn.createChannel();
        const ok = await ch.assertQueue(queueName);

        if (!ok) {
            return;
        }

        const pipe = this.pipe;
        async function getMsg(msg) {
            if (msg !== null) {
                ch.ack(msg);
                const metadata: IMetadata = { noMeta: true };
                const msgRef = new MessageRef(metadata, msg.content, new SpanContext());
                try {
                    await pipe.send(msgRef);
                } catch {
                    return;
                }
            }
        }
        await ch.consume(queueName, getMsg);
        yield* this.pipe;
    }

    public async stop(): Promise<void> {
        return;
    }
}
