/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export class EpochManager {
    private readonly epochs: Map<string, number>;
    private readonly callbacks: Set<(key: string) => void>;

    constructor() {
        this.epochs = new Map();
        this.callbacks = new Set();
    }

    public get(key: string): number {
        return this.epochs.get(key) || 1;
    }

    public invalidate(key: string): void {
        this.epochs.set(key, this.get(key) + 1);
        for (const cb of this.callbacks.values()) {
            cb(key);
        }
    }

    public evict(key: string): void {
        this.epochs.delete(key);
    }

    public on(_: "invalidated", cb: (key: string) => void) {
        this.callbacks.add(cb);
    }
}
