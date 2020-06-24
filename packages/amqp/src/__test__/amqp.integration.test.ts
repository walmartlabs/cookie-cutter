/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    StaticInputSource,
    IMessage,
    IDispatchContext,
    CapturingOutputSink,
    ParallelismMode,
    ErrorHandlingMode,
    sleep,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration, amqpSink, amqpSource } from "..";
import * as amqp from "amqplib";

jest.setTimeout(10000);

async function waitForServer() {
    const options: amqp.Options.Connect = {
        protocol: "amqp",
        hostname: "localhost",
    };
    while (true) {
        try {
            const conn = await amqp.connect(options);
            await conn.close();
            break;
        } catch (e) {
            await sleep(500);
        }
    }
}

describe("AmqpSink and AmqpSource", () => {
    beforeAll(async () => {
        await waitForServer();
    });
    class MessageClass {
        public constructor(public payload: string) {}
    }

    function inputGen(num: number): IMessage[] {
        const input: IMessage[] = [];
        for (let ii = 1; ii <= num; ii++) {
            input.push({
                type: MessageClass.name,
                payload: new MessageClass(`Message #${ii}`),
            });
        }
        return input;
    }

    const numMessages = 200;
    const config: IAmqpConfiguration = {
        queue: {
            queueName: "defaultQueueName",
        },
        encoder: new JsonMessageEncoder(),
    };

    it("produces messages with AmqpSink", async () => {
        await expect(
            Application.create()
                .logger(new ConsoleLogger())
                .input()
                .add(new StaticInputSource(inputGen(numMessages)))
                .done()
                .dispatch({
                    async onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
                        ctx.publish(MessageClass, msg);
                    },
                })
                .output()
                .published(amqpSink(config))
                .done()
                .run()
        ).resolves.toBe(undefined);
    });

    it("consumes messages with AmqpSource", async () => {
        const outputOne = [];
        const consumerOne = Application.create()
            .logger(new ConsoleLogger())
            .input()
            .add(amqpSource(config))
            .done()
            .dispatch({
                onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
                    ctx.publish(MessageClass, msg);
                },
            })
            .output()
            .published(new CapturingOutputSink(outputOne))
            .done()
            .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Serial);

        await sleep(200);
        consumerOne.cancel();
        await consumerOne;
        expect(outputOne.length).toBe(numMessages);
    });
});
