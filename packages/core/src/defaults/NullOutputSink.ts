/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IOutputSink, IOutputSinkGuarantees } from "..";
import { OutputSinkConsistencyLevel } from "../model";

export class NullOutputSink<T> implements IOutputSink<T> {
    public sink(): Promise<void> {
        return Promise.resolve();
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.Atomic,
            idempotent: true,
        };
    }
}
