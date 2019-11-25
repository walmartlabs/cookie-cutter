/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export class Future<T> {
    public readonly promise: Promise<T> = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    public resolve!: (value?: T | PromiseLike<T> | undefined) => void;
    public reject!: (reason?: any) => void;
}
