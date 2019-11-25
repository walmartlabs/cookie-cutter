/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export class Batch<T> {
    public readonly items: T[];
    private waited: boolean;

    constructor(private readonly min, private readonly max) {
        this.items = [];
        this.waited = false;
    }

    public add(item: T): void {
        this.items.push(item);
    }

    public isFull(): boolean {
        return this.items.length === this.max;
    }

    public shouldLinger(): boolean {
        if (!this.waited && this.items.length < this.min) {
            this.waited = true;
            return true;
        }

        return false;
    }

    public reset(): void {
        this.items.length = 0;
        this.waited = false;
    }
}
