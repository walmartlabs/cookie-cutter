import {
    Application,
    ConsoleLogger,
    StaticInputSource,
    IMessage,
    IDispatchContext,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration, amqpSink } from ".";

export class MessageClass {
    public num: number = 10;
    public constructor(public payload: string) {}
}

const num = 100;
function inputGen(): IMessage[] {
    const rn = Math.floor(Math.random() * 1000);
    const input: IMessage[] = [];
    for (let ii = 1; ii <= num; ii++) {
        input.push({
            type: MessageClass.name,
            payload: new MessageClass(`Message #${ii} -- ${rn}`),
        });
    }
    return input;
}

const input = inputGen();

const config: IAmqpConfiguration = {
    host: "localhost",
    queueName: "testQueue",
    encoder: new JsonMessageEncoder(),
};

async function runSink() {
    await Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new StaticInputSource(input))
        .done()
        .dispatch({
            async onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
                ctx.logger.info(MessageClass.name, msg);
                ctx.publish(MessageClass, msg);
            },
        })
        .output()
        .published(amqpSink(config))
        .done()
        .run();
}

async function runTest() {
    await runSink();
}

runTest();
