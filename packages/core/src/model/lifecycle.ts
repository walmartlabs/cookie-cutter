/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Tracer } from "opentracing";
import { ILogger } from "./logger";
import { IMetrics } from "./metrics";

export interface IComponentContext {
    readonly logger: ILogger;
    readonly metrics: IMetrics;
    readonly tracer: Tracer;
}

export interface IRequireInitialization {
    initialize(context: IComponentContext): Promise<void>;
}

export interface IDisposable {
    dispose(): Promise<void>;
}

export function isDisposable(obj: any): obj is IDisposable {
    return obj.dispose !== undefined;
}

export function isInitializable(obj: any): obj is IRequireInitialization {
    return obj.initialize !== undefined;
}

export type Lifecycle<T> = T & IDisposable & IRequireInitialization;

export function makeLifecycle<T>(obj: T): Lifecycle<T> {
    if (!isInitializable(obj)) {
        (obj as any).initialize = () => Promise.resolve();
    }

    if (!isDisposable(obj)) {
        (obj as any).dispose = () => Promise.resolve();
    }

    return obj as Lifecycle<T>;
}
