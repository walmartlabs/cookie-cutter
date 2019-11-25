/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IInterval } from ".";

export class Interval implements IInterval {
    private overriddenTimeout: number | undefined;

    constructor(public readonly eventTime: Date) {}

    public overrideNextTimeout(timeout: number): void {
        this.overriddenTimeout = timeout;
    }

    public get nextTimeout(): number | undefined {
        return this.overriddenTimeout;
    }
}
