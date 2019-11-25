/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from "..";

export * from "./SinkCoordinator";

export interface IBatchResult {
    readonly successful: BufferedDispatchContext[];
    readonly failed: BufferedDispatchContext[];
    readonly error?: {
        readonly error: Error;
        readonly retryable: boolean;
    };
}
