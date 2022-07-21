/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

const mockSleep: jest.Mock = jest.fn();
jest.mock("../../utils", () => {
    const utils = jest.requireActual("../../utils");
    return {
        ...utils,
        sleep: mockSleep,
    };
});
import { ErrorHandlingMode, IComponentRuntimeBehavior, RetryMode } from "../../model";
import { createRetrier, InternalRetrier, IRetrier, RetrierContext } from "../../utils/retry";

const mockIsFinalAttempt: jest.Mock = jest.fn();
const mockNotFinalAttempt: jest.Mock = jest.fn();

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

class InnerBailError extends Error {
    constructor() {
        super("InnerBail Error");
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
asyncThrowingFunction.mockImplementation(async (client: ThrowingClient): Promise<boolean> => {
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

const throwingFunctionWithBail: jest.Mock = jest.fn();
throwingFunctionWithBail.mockImplementation(
    async (client: ThrowingClient, retry: RetrierContext): Promise<boolean> => {
        if (client.errorsThrown === client.indexOfInnerBail) {
            client.errorsThrown++;
            retry.bail(new InnerBailError());
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
    public readonly indexOfInnerBail: number;
    public readonly retry: RetrierContext;

    constructor(
        public readonly errorsToThrow: number,
        indexOfNonRetriableError?: number,
        indexOfInnerBail?: number
    ) {
        this.errorsThrown = 0;
        this.indexOfNonRetriableError =
            indexOfNonRetriableError === undefined ? errorsToThrow + 1 : indexOfNonRetriableError;
        this.indexOfInnerBail =
            indexOfInnerBail === undefined ? errorsToThrow + 1 : indexOfInnerBail;
    }

    public throwingFunction() {
        return throwingFunction(this);
    }

    public async asyncThrowingFunction() {
        return asyncThrowingFunction(this);
    }

    public throwingFunctionWithBail(retry: RetrierContext) {
        return throwingFunctionWithBail(this, retry);
    }
}

async function asyncCallClient(client: ThrowingClient, retrier: IRetrier): Promise<any> {
    return baseCallClient(true, client, retrier);
}

async function callClient(client: ThrowingClient, retrier: IRetrier) {
    return baseCallClient(false, client, retrier);
}

async function baseCallClient(
    isAsync: boolean,
    client: ThrowingClient,
    retrier: IRetrier
): Promise<any> {
    const val = await retrier.retry(async (retry: RetrierContext) => {
        try {
            if (isAsync) {
                return await client.asyncThrowingFunction();
            } else {
                return await client.throwingFunction();
            }
        } catch (e) {
            if (e instanceof NonRetriableError) {
                mockIsFinalAttempt();
                retry.bail(e);
            }
            if (retry.currentAttempt >= retry.maxAttempts) {
                mockIsFinalAttempt();
            } else {
                mockNotFinalAttempt();
            }
            throw e;
        }
    });
    return val;
}

async function callClientWithCustomInterval(
    client: ThrowingClient,
    retrier: InternalRetrier
): Promise<void> {
    await retrier.retry(async (retry: RetrierContext) => {
        try {
            return await client.throwingFunction();
        } catch (e) {
            if (retry.currentAttempt === 3) {
                retry.setNextRetryInterval(retry.currentAttempt * retrier.behavior.retryIntervalMs);
            }
            throw e;
        }
    });
}

async function callClientWithInnerBail(
    client: ThrowingClient,
    retrier: InternalRetrier
): Promise<void> {
    await retrier.retry(async (retry: RetrierContext) => {
        try {
            return await client.throwingFunctionWithBail(retry);
        } catch (e) {
            if (retry.hasBailed) {
                mockIsFinalAttempt();
            } else {
                mockNotFinalAttempt();
            }
            throw e;
        }
    });
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
            await expect(callClient(client, retrier)).rejects.toThrowError(new RetriableError());
            expect(throwingFunction).toHaveBeenCalledTimes(1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(0);
        });
    });

    describe("LogAndRetryOrFail", () => {
        it("makes one call, 5 retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClient(client, retrier)).rejects.toThrowError(new RetriableError());
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(5);
        });

        it("makes one call, 2 retries and fails on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(callClient(client, retrier)).rejects.toThrowError(new NonRetriableError());
            expect(throwingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClient(client, retrier)).resolves.toBeTruthy();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(0);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });
    });

    describe("LogAndContinue", () => {
        it("makes one call, no retries and continues", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndContinue;
            const errorsToThrow = 10;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClient(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(0);
        });
    });

    describe("LogAndRetryOrContinue", () => {
        it("makes one call, 5 retries and continues", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClient(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(5);
        });

        it("makes one call, 2 retries and continues on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(callClient(client, retrier)).resolves.toBeUndefined();
            expect(throwingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrContinue;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClient(client, retrier)).resolves.toBeTruthy();
            expect(throwingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(0);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });
    });

    describe("Async LogAndFail", () => {
        it("makes one call, no retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndFail;
            const errorsToThrow = 10;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClient(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(0);
        });
    });

    describe("Async LogAndRetryOrFail", () => {
        it("makes one call, 5 retries and fails", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClient(client, retrier)).rejects.toThrowError(
                new RetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(errorsToThrow);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(5);
        });

        it("makes one call, 2 retries and fails on NonRetriableError", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = behavior.retries + 1;
            const indexOfNonRetriableError = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, indexOfNonRetriableError);
            await expect(asyncCallClient(client, retrier)).rejects.toThrowError(
                new NonRetriableError()
            );
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(indexOfNonRetriableError + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });

        it("makes one call, 2 retries and succeeds", async () => {
            const behavior = { ...defaultBehavior };
            behavior.mode = ErrorHandlingMode.LogAndRetryOrFail;
            const errorsToThrow = 2;
            const retrier = createRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(asyncCallClient(client, retrier)).resolves.toBeTruthy();
            expect(asyncThrowingFunction).toHaveBeenCalledTimes(errorsToThrow + 1);
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(0);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
        });
    });

    describe("Setting a custom retry interval", () => {
        it("sets custom retry intervals on second and third calls", async () => {
            const behavior = { ...defaultBehavior, retryMode: RetryMode.Exponential };
            const errorsToThrow = 4;
            const retrier = new InternalRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow);
            await expect(callClientWithCustomInterval(client, retrier)).resolves.toBeUndefined();
            expect(mockSleep).toHaveBeenNthCalledWith(2, retrier.nextRetryInterval(2));
            expect(mockSleep).toHaveBeenNthCalledWith(3, 3 * behavior.retryIntervalMs);
            expect(mockSleep).toHaveBeenNthCalledWith(4, retrier.nextRetryInterval(4));
        });
    });

    describe("Bailing from inside a client", () => {
        it("bails and records finalAttempt as true", async () => {
            const behavior = { ...defaultBehavior, retryMode: RetryMode.Linear };
            const indexOfInnerBail = 2;
            const errorsToThrow = 4;
            const retrier = new InternalRetrier(behavior);
            const client = new ThrowingClient(errorsToThrow, undefined, indexOfInnerBail);
            await expect(callClientWithInnerBail(client, retrier)).rejects.toThrowError(
                new InnerBailError()
            );
            expect(mockIsFinalAttempt).toHaveBeenCalledTimes(1);
            expect(mockNotFinalAttempt).toHaveBeenCalledTimes(2);
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
            await expect(callClient(client, retrierFail)).resolves.toBeTruthy();
            await expect(callClient(client, retrierContinue)).resolves.toBeTruthy();
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
