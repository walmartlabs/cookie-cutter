/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMetrics } from "../model";

/* istanbul ignore next */
export class NullMetrics implements IMetrics {
    public increment(): void {
        // nothing
    }

    public decrement(): void {
        // nothing
    }

    public gauge(): void {
        // nothing
    }

    public timing(): void {
        // nothing
    }
}
