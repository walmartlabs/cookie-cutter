/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export interface IDummyStateSnapshot {
    value: string;
}

export class DummyState {
    public value: string;
    public constructor(snapshot?: IDummyStateSnapshot) {
        if (snapshot) {
            this.value = snapshot.value;
        }
    }
    public snap(): IDummyStateSnapshot {
        return { value: this.value };
    }
}
