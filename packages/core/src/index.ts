/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export * from "./model";
export * from "./snapshot";
export * from "./utils";
export * from "./defaults";
export * from "./cache";
export * from "./eventStream";
export * from "./testing";

import * as cfg from "./config";
import { ApplicationBuilder } from "./internal";
import { IApplicationBuilder } from "./model";

export const config = cfg;

if (Symbol.asyncIterator === undefined) {
    (Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");
}

export const Application = {
    create(): IApplicationBuilder {
        // this needs to be loaded first so it can setup
        // wrappers for some node types
        require("wtfnode");

        return new ApplicationBuilder();
    },
};

export function isDebug(): boolean {
    return process.env.KUBERNETES_SERVICE_HOST === undefined;
}
