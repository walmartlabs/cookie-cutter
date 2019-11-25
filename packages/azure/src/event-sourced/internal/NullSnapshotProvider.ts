/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ISnapshotProvider } from "..";

export class NullSnapshotProvider<TSnapshot> implements ISnapshotProvider<TSnapshot> {
    public get(): Promise<[number, TSnapshot]> {
        return Promise.resolve([0, undefined] as any);
    }
}
