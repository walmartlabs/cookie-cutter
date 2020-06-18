import {
    Application,
    ConsoleLogger,
    StaticInputSource,
    IMessage,
    IDispatchContext,
    ErrorHandlingMode,
    ParallelismMode,
} from "@walmartlabs/cookie-cutter-core";
import { AmqpSink } from "./AmqpSink";
import { AmqpSource } from "./AmqpSource";

export class MessageClass {
    public constructor(public payload: string) {}
}

const num = 10;
function inputGen(): IMessage[] {
    const input: IMessage[] = [];
    for (let ii = 1; ii <= num; ii++) {
        input.push({ type: MessageClass.name, payload: new MessageClass(`Message #${ii}`) });
    }
    return input;
}

const input = inputGen();

async function runSink() {
    console.log("===============");
    await Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new StaticInputSource(input))
        .done()
        .dispatch({
            onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
                console.log("Sink: ", msg);
                ctx.publish(MessageClass, msg);
            },
        })
        .output()
        .published(new AmqpSink({ host: "localhost", queueName: "testQueue" }))
        .done()
        .run();
}

async function runSource() {
    console.log("===============");
    await Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new AmqpSource({ host: "localhost", queueName: "testQueue" }))
        .done()
        .dispatch({
            onMessageClass(msg: MessageClass, _ctx: IDispatchContext<any>) {
                console.log("Source: ", msg);
            },
        })
        .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Serial);
}

async function runTest() {
    await runSink();
    await runSource();
}

runTest();
