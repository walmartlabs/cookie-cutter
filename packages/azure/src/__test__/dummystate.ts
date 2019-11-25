/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export class DummyState<T> {
    public value: T;
    constructor(snap?: { value: T }) {
        if (snap) {
            this.value = snap.value;
        }
    }
    public snap(): any {
        return { value: this.value };
    }
}
