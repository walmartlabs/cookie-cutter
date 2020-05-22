/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    DefaultComponentContext,
    IComponentContext,
    IDispatchContext,
    ILogger,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    OutputSinkConsistencyLevel,
    sleep,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";

class Foo {
    constructor(public text: string) {}
}

class Bar {
    constructor(public text: string) {}
}

class MySink implements IOutputSink<IPublishedMessage>, IRequireInitialization {
    private logger: ILogger;

    constructor() {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext) {
        this.logger = context.logger;
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const batch = Array.from(output);
        this.logger.info(`received batch with ${batch.length} items`);
        for (const item of batch) {
            this.logger.info(`publishing ${item.message.payload.text}`);
        }
    }

    public guarantees: IOutputSinkGuarantees = {
        consistency: OutputSinkConsistencyLevel.Atomic,
        idempotent: false,
    };
}

Application.create()
    .input()
    .add(
        new StaticInputSource([
            { type: Foo.name, payload: new Foo("1") },
            { type: Foo.name, payload: new Foo("2") },
            { type: Foo.name, payload: new Foo("3") },
            { type: Foo.name, payload: new Foo("4") },
        ])
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onFoo: async (msg: Foo, ctx: IDispatchContext) => {
            ctx.publish(Bar, new Bar(`output for ${msg.text}`));
            if (msg.text === "4") {
                await sleep(100);
            }
        },
    })
    .output()
    .published(new MySink())
    .done()
    .run();
