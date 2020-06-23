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
    CancelablePromise,
    sleep,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration, amqpSink, amqpSource } from "..";

describe("AmqpSink and AmqpSource", () => {
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

    function runConsumerApp(output: any[], config: IAmqpConfiguration): CancelablePromise<void> {
        return Application.create()
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
            .published(new CapturingOutputSink(output))
            .done()
            .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Serial);
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

    it("consumes using 2 consumers with AmqpSource", async () => {
        const outputOne = [];
        const outputTwo = [];
        const consumerOne = runConsumerApp(outputOne, config);
        const consumerTwo = runConsumerApp(outputTwo, config);
        const apps = [consumerOne, consumerTwo];
        await sleep(500);
        consumerOne.cancel();
        consumerTwo.cancel();
        await Promise.all(apps);
        // number of messages consumed is varies slightly
        const lowerBound = Math.round((numMessages / 2) * 0.95);
        const upperBound = Math.round((numMessages / 2) * 1.05);
        expect(outputOne.length).toBeGreaterThan(lowerBound);
        expect(outputOne.length).toBeLessThan(upperBound);
        expect(outputTwo.length).toBeGreaterThan(lowerBound);
        expect(outputTwo.length).toBeLessThan(upperBound);
    });
});
