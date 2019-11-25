/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ErrorHandlingMode, IComponentRuntimeBehavior, RetryMode } from "../../model";
import { createRetrier, InternalRetrier, IRetrier } from "../../utils/retry";

class NonRetriableError extends Error {
    constructor() {
        super("NonRetriable Error");
    }
}

class RetriableError extends Error {
    constructor() {
        super("Retriable Error");
    }
}

const throwingFunction: jest.Mock = jest.fn();
throwingFunction.mockImplementation((client: ThrowingClient): boolean => {
    if (client.errorsThrown === client.indexOfNonRetriableError) {
        client.errorsThrown++;
        throw new NonRetriableError();
    }
    if (client.errorsThrown < client.errorsToThrow) {
        client.errorsThrown++;
        throw new RetriableError();
    }
    return true;
});

const asyncThrowingFunction: jest.Mock = jest.fn();
asyncThrowingFunction.mockImplementation(
    async (client: ThrowingClient): Promise<boolean> => {
        if (client.errorsThrown === client.indexOfNonRetriableError) {
            client.errorsThrown++;
            throw new NonRetriableError();
        }
        if (client.errorsThrown < client.errorsToThrow) {
            client.errorsThrown++;
            throw new RetriableError();
        }
        return true;
    }
);

class ThrowingClient {
    public errorsThrown: number;
    public readonly indexOfNonRetriableError: number;

    constructor(public readonly errorsToThrow: number, indexOfNonRetriableError?: number) {
        this.errorsThrown = 0;
        this.indexOfNonRetriableError =
            indexOfNonRetriableError === undefined ? errorsToThrow + 1 : indexOfNonRetriableError;
    }

    public throwingFunction() {
        return throwingFunction(this);
    }

    public async asyncThrowingFunction() {
        return asyncThrowingFunction(this);
    }
}

async function asyncCallClientWithRetry(client: ThrowingClient, retrier: IRetrier): Promise<any> {
    const val = await retrier.retry(async (bail: any) => {
        try {
            return await client.asyncThrowingFunction();
        } catch (e) {
            if (e instanceof NonRetriableError) {
                bail(e);
            }
            throw e;
        }
    });
    return val;
}

async function callClientWithRetry(client: ThrowingClient, retrier: IRetrier): Promise<any> {
    const val = await retrier.retry(async (bail: any) => {
        try {
            return await client.throwingFunction();
        } catch (e) {
            if (e instanceof NonRetriableError) {
                bail(e);
            }
            throw e;
        }
    });
    return val;
}

const defaultBehavior: Required<IComponentRuntimeBehavior> = {
    mode: ErrorHandlingMode.LogAndRetryOrFail,
    maxRetryIntervalMs: 30000,
    retryIntervalMs: 1,
    retryMode: RetryMode.Exponential,
    exponentBase: 2,
    randomize: false,
    retries: 5,
};

describe("Testing Retrier", () => {
    describe("LogAndFail", () => {
        it("makes one call, does not retry and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndFail;
            const errorsToThrow = 10;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(throwingFunction).toHaveBeenCalledTimes(1);
        });
    });

    describe("LogAndRetryOrFail", () => {
        it("makes one call, 5 retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow);
        });

        it("makes one call, 2 retries and fails on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(callClientWithRetry(client, retrier)).rejects.toThrowError(
                new NonRetriableError()
            );
            expect(throwingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).resolves.toBeTruthy();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
        });
    });

    describe("LogAndContinue", () => {
        it("makes one call, no retries and continues", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndContinue;
            const errorsToThrow = 10;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(1);
        });
    });

    describe("LogAndRetryOrContinue", () => {
        it("makes one call, 5 retries and continues", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow);
        });

        it("makes one call, 2 retries and continues on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(callClientWithRetry(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrier)).resolves.toBeTruthy();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
        });
    });

    describe("Async LogAndFail", () => {
        it("makes one call, no retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndFail;
            const errorsToThrow = 10;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClientWithRetry(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(1);
        });
    });

    describe("Async LogAndRetryOrFail", () => {
        it("makes one call, 5 retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClientWithRetry(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(errorsToThrow);
        });

        it("makes one call, 2 retries and fails on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(asyncCallClientWithRetry(client, retrier)).rejects.toThrowError(
                new NonRetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClientWithRetry(client, retrier)).resolves.toBeTruthy();
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
        });
    });

    describe("Default Settings for Retriers", () => {
        it("initializes with defaults", async () => {
            const retrierFail = createRetrier({
                ...defaultBehavior,
                mode: ErrorHandlingMode.LogAndRetryOrFail,
            });
            const retrierContinue = createRetrier({
                ...defaultBehavior,
                mode: ErrorHandlingMode.LogAndRetryOrContinue,
            });
            const errorsToThrow = 0;
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithRetry(client, retrierFail)).resolves.toBeTruthy();
            await expect(callClientWithRetry(client, retrierContinue)).resolves.toBeTruthy();
        });
    });

    describe("Setting the retryMode and exponentBase based on what's provided", () => {
        const intervalMs = 100;
        const defaultBehavior: Required<IComponentRuntimeBehavior> = {
            mode: ErrorHandlingMode.LogAndRetryOrFail,
            maxRetryIntervalMs: 30000,
            retryIntervalMs: intervalMs,
            retryMode: RetryMode.Exponential,
            exponentBase: 2,
            randomize: false,
            retries: 5,
        };
        it("keeps the exponentBase to 1 when given RetryMode.Linear", () => {
            const behavior = { ...defaultBehavior };
            behavior.exponentBase = 1;
            behavior.retryMode = RetryMode.Linear;
            const retrier = new InternalRetrier(behavior);
            expect(retrier.nextRetryInterval(3)).toBe(1 * intervalMs);
        });
        it("sets the exponentBase to 1 when given RetryMode.Linear", () => {
            const behavior = { ...defaultBehavior };
            behavior.exponentBase = 3;
            behavior.retryMode = RetryMode.Linear;
            const retrier = new InternalRetrier(behavior);
            expect(retrier.nextRetryInterval(3)).toBe(1 * intervalMs);
        });
        it("changes exponentBase of 1 to the default 2 when given RetryMode.Exponential", () => {
            const behavior = { ...defaultBehavior };
            behavior.exponentBase = 1;
            behavior.retryMode = RetryMode.Exponential;
            const retrier = new InternalRetrier(behavior);
            expect(retrier.nextRetryInterval(3)).toBe(4 * intervalMs);
        });
        it("keeps a greater than 1 exponentBase when given RetryMode.Exponential", () => {
            const behavior = { ...defaultBehavior };
            behavior.exponentBase = 3;
            behavior.retryMode = RetryMode.Exponential;
            const retrier = new InternalRetrier(behavior);
            expect(retrier.nextRetryInterval(3)).toBe(9 * intervalMs);
        });
    });

    describe("Setting number of retries based on ErrorHandlingMode", () => {
        it("uses LogAndRetry", () => {
            const behavior: Required<IComponentRuntimeBehavior> = {
                ...defaultBehavior,
                mode: ErrorHandlingMode.LogAndRetry,
            };
            const retrier = new InternalRetrier(behavior);
            expect(retrier.behavior.retries).toBe(Infinity);
        });
    });
});
