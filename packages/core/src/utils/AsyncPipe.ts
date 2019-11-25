/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

if (Symbol.asyncIterator === undefined) {
    (Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for("Symbol.asyncIterator");
}

export class AsyncPipe<T> implements AsyncIterableIterator<T> {
    private _closed: boolean;
    private _resolve: (result: IteratorResult<T>) => void;
    private _reject: (err: any) => void;
    private _sent: () => void;
    private _thrown: (result: IteratorResult<T>) => void;
    private _value: T;
    private _err: any;

    constructor() {
        this._closed = false;
        this._resolve = null;
        this._sent = null;
        this._value = null;
    }

    public get closed(): boolean {
        return this._closed;
    }

    public send(value: T): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._closed || this._thrown) {
                reject(new Error("can't send after close/throw"));
            } else if (this._sent) {
                reject(new Error("there is already a pending send call"));
            } else if (this._resolve) {
                const cb = this._resolve;
                this._resolve = null;
                this._reject = null;
                cb({ done: false, value });
                resolve();
            } else {
                this._value = value;
                this._sent = resolve;
            }
        });
    }

    public throw(e?: any): Promise<IteratorResult<T>> {
        return new Promise((resolve) => {
            if (this._closed) {
                resolve({ done: true, value: e });
            } else if (this._reject) {
                const cb = this._reject;
                this._resolve = null;
                this._reject = null;
                this._closed = true;
                cb(e);
                resolve({ done: true, value: e });
            } else {
                this._err = e;
                this._thrown = resolve;
            }
        });
    }

    public close(): Promise<void> {
        this._closed = true;
        if (this._resolve) {
            const cb = this._resolve;
            this._resolve = null;
            this._reject = null;
            cb({ done: true, value: undefined });
        }

        if (this._sent) {
            const cb = this._sent;
            this._sent = null;
            this._value = null;
            cb();
        }

        if (this._thrown) {
            const cb = this._thrown;
            this._thrown = null;
            this._err = null;
            cb({ done: true, value: undefined });
        }

        return Promise.resolve();
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        return this;
    }

    public [Symbol.iterator](): AsyncIterableIterator<T> {
        return this;
    }

    public next(): Promise<IteratorResult<T>> {
        return new Promise((resolve, reject) => {
            if (this._closed) {
                resolve({ done: true, value: undefined });
            } else if (this._sent) {
                const cb = this._sent;
                const value = this._value;
                this._sent = null;
                this._value = null;
                cb();
                resolve({ done: false, value });
            } else if (this._thrown) {
                const cb = this._thrown;
                const err = this._err;
                this._value = null;
                this._err = null;
                this._sent = null;
                this._thrown = null;
                this._closed = true;
                cb({ done: true, value: err });
                reject(err);
            } else {
                this._resolve = resolve;
                this._reject = reject;
            }
        });
    }
}
