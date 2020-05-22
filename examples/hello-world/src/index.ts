/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";

interface IFoo {
    text: string;
}
interface IBar {
    text: string;
}

Application.create()
    .input()
    .add(
        new StaticInputSource([
            { type: "Foo", payload: { text: "hello" } },
            { type: "Bar", payload: { text: "world" } },
        ])
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onFoo: (msg: IFoo, ctx: IDispatchContext): void => {
            ctx.logger.info(msg.text);
        },
        onBar: (msg: IBar, ctx: IDispatchContext): void => {
            ctx.logger.warn(msg.text);
        },
    })
    .run();
