/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from "..";

export * from "./SinkCoordinator";

export interface IBatchResult<T = BufferedDispatchContext> {
    readonly successful: T[];
    readonly failed: T[];
    readonly error?: {
        readonly error: Error;
        readonly retryable: boolean;
    };
}
