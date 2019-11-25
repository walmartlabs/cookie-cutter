/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ErrorHandlingMode, IComponentRuntimeBehavior, RetryMode } from "../model";
import { sleep } from "../utils";

export interface IRetrier {
    retry<T>(func: (bail: (err: any) => never) => Promise<T> | T): Promise<T>;
}

export function createRetrier(behavior: Required<IComponentRuntimeBehavior>): IRetrier {
    switch (behavior.mode) {
        case ErrorHandlingMode.LogAndContinue:
        case ErrorHandlingMode.LogAndRetryOrContinue:
            return new LogAndRetryOrContinueRetrier(behavior);
        default:
            return new LogAndRetryOrFailRetrier(behavior);
    }
}

class LogAndRetryOrContinueRetrier implements IRetrier {
    private readonly internalRetrier: InternalRetrier;

    constructor(public readonly behavior: Required<IComponentRuntimeBehavior>) {
        this.internalRetrier = new InternalRetrier(this.behavior);
    }

    public async retry<T>(func: (bail: (err: any) => never) => Promise<T> | T): Promise<T> {
        try {
            return await this.internalRetrier.retry(func);
        } catch (e) {
            return;
        }
    }
}

class LogAndRetryOrFailRetrier implements IRetrier {
    private readonly internalRetrier: InternalRetrier;

    constructor(public readonly behavior: Required<IComponentRuntimeBehavior>) {
        this.internalRetrier = new InternalRetrier(this.behavior);
    }

    public async retry<T>(func: (bail: (err: any) => never) => Promise<T> | T): Promise<T> {
        try {
            return await this.internalRetrier.retry(func);
        } catch (e) {
            throw e;
        }
    }
}

export class InternalRetrier implements IRetrier {
    public readonly behavior: Required<IComponentRuntimeBehavior>;

    constructor(behavior: Required<IComponentRuntimeBehavior>) {
        let retries = behavior.retries;
        if (
            behavior.mode === ErrorHandlingMode.LogAndContinue ||
            behavior.mode === ErrorHandlingMode.LogAndFail
        ) {
            retries = 0;
        }
        if (behavior.mode === ErrorHandlingMode.LogAndRetry) {
            retries = Infinity;
        }

        let exponentBase = behavior.exponentBase;
        if (behavior.retryMode === RetryMode.Exponential) {
            exponentBase = exponentBase > 1 ? exponentBase : 2;
        } else {
            exponentBase = 1;
        }

        this.behavior = {
            ...behavior,
            retries,
            exponentBase,
        };
    }

    public async retry<T>(func: (bail: (err: any) => never) => Promise<T> | T): Promise<T> {
        let keepRetrying = true;
        let attempt = 1;
        const maxAttempts = this.behavior.retries + 1;
        do {
            try {
                let val = func((err: any) => {
                    keepRetrying = false;
                    throw err;
                });
                if (this.isPromise(val)) {
                    val = await (val as Promise<T>);
                }
                return val;
            } catch (e) {
                if (attempt >= maxAttempts) {
                    throw e;
                }
                if (!keepRetrying) {
                    throw e;
                }
                const nextInterval = this.nextRetryInterval(attempt);
                await sleep(nextInterval);
                attempt++;
            }
        } while (true);
    }

    public nextRetryInterval(attempt: number): number {
        const random = this.behavior.randomize ? Math.random() + 1 : 1;
        return Math.min(
            Math.round(
                random *
                    this.behavior.retryIntervalMs *
                    Math.pow(this.behavior.exponentBase, attempt - 1)
            ),
            this.behavior.maxRetryIntervalMs
        );
    }

    public isPromise(val: any): val is Promise<void> {
        return val && val.then && val.catch;
    }
}
