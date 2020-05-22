/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IDispatchContext,
    IInputSource,
    ILogger,
    IMessage,
    IRequireInitialization,
    MessageRef,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { Tracer } from "opentracing";

interface ISomeEvent {
    value: number;
}

class MyInputSource implements IInputSource, IRequireInitialization {
    private logger: ILogger;
    private tracer: Tracer;
    private done: boolean;

    constructor() {
        this.logger = DefaultComponentContext.logger;
        this.tracer = DefaultComponentContext.tracer;
        this.done = false;
    }

    public async initialize(context: IComponentContext) {
        this.logger = context.logger;
        this.tracer = context.tracer;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        while (!this.done) {
            const msg: IMessage = {
                type: "my-company.department.SomeEvent",
                payload: {
                    value: 5,
                },
            };

            const meta = {
                user: "jdoe",
            };

            const span = this.tracer.startSpan("trace-name");
            // TODO: populate span with proper tags

            const msgRef = new MessageRef(meta, msg, span.context());
            msgRef.once("released", async (_, __, e) => {
                if (e) {
                    failSpan(span, e);
                }
                span.finish();
            });

            await sleep(500);
            this.logger.debug("yielding new input message");
            yield msgRef;
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
    }
}

Application.create()
    .input()
    .add(new MyInputSource())
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onSomeEvent: (msg: ISomeEvent, ctx: IDispatchContext): void => {
            ctx.logger.info("handling some event with value " + msg.value);
        },
    })
    .run();
