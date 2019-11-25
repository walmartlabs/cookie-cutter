/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IOutputSink } from "..";
import { IOutputSinkGuarantees, OutputSinkConsistencyLevel } from "../model";

export class CapturingOutputSink<T> implements IOutputSink<T> {
    constructor(private readonly target: T[]) {}

    public sink(output: IterableIterator<T>): Promise<void> {
        for (const item of output) {
            this.target.push(item);
        }

        return Promise.resolve();
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.Atomic,
            idempotent: false,
        };
    }
}
