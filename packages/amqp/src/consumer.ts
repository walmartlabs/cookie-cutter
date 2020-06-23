import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    ErrorHandlingMode,
    ParallelismMode,
    JsonMessageEncoder,
    CapturingOutputSink,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration, amqpSource } from ".";

export class MessageClass {
    public num: number = 10;
    public constructor(public payload: string) {}
}

const config: IAmqpConfiguration = {
    host: "localhost",
    queueName: "testQueue",
    encoder: new JsonMessageEncoder(),
};

async function runSource() {
    const output = [];
    await Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(amqpSource(config))
        .done()
        .dispatch({
            onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
                ctx.logger.info("Source", msg);
                ctx.publish(MessageClass, msg);
            },
        })
        .output()
        .published(new CapturingOutputSink(output))
        .done()
        .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Serial);
    console.log("Output: ", output.length);
}

async function runTest() {
    await runSource();
}

runTest();
