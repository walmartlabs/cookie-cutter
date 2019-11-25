/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    createRetrier,
    ErrorHandlingMode,
    EventSourcedMetadata,
    iterate,
    JsonMessageEncoder,
    MessageRef,
    RetryMode,
    SequenceConflictError,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { ICosmosConfiguration } from "../../..";
import { CosmosOutputSink } from "../../../materialized/internal";
import { CosmosClient, ICosmosDocument } from "../../../utils";
import { DummyMessageEncoder } from "../../dummyEncoder";
import { DummyState } from "../../dummystate";

jest.mock("../../../utils/CosmosClient", () => {
    return {
        CosmosClient: jest.fn(),
    };
});
const MockCosmosClient: jest.Mock = CosmosClient as any;

const bailed: jest.Mock = jest.fn();
const bail = (err: any): never => {
    bailed(err);
    throw err;
};

describe("materialized CosmosOutputSink", () => {
    const config: ICosmosConfiguration = {
        url: "test",
        key: "test",
        collectionId: "test",
        databaseId: "test",
        encoder: new JsonMessageEncoder(),
    };
    let upsert: jest.Mock;
    const spanContext = new SpanContext();
    const optimisticConcurrencyKey = "occErr";
    let dbQueryTimeout = "dbQueryTimeout";
    let counter = 0;
    const numErrors = 5;
    const not400ErrorKey = "not400Error";
    const regularKey = "regularKey";
    const bodyDbQueryTimeout = `DB Query returned FALSE: Failed to replace document: stream_id: ${dbQueryTimeout}, sn: 0`;
    const bodyOptimisticConcurrency = `Sequence Conflict for document: stream_id: ${optimisticConcurrencyKey}, new sn: 0, expected sn: 0, actual sn: 0.`; // keep the string synced to ../resources/upsertSproc.js
    beforeEach(() => {
        (upsert = jest.fn().mockImplementation((_, partitionKey) => {
            if (partitionKey === optimisticConcurrencyKey) {
                throw {
                    code: 400,
                    body: { message: bodyOptimisticConcurrency },
                };
            }
            if (partitionKey === dbQueryTimeout) {
                counter++;
                if (counter >= numErrors + 1) {
                    dbQueryTimeout = regularKey;
                    return;
                }
                throw {
                    code: 400,
                    body: { message: bodyDbQueryTimeout },
                };
            }
            if (partitionKey === not400ErrorKey) {
                throw {
                    code: 500,
                    body: "Internal Server Error",
                };
            }
        })),
            MockCosmosClient.mockImplementation(() => {
                return {
                    initialize: jest.fn(),
                    query: jest.fn(),
                    upsert,
                    bulkInsert: jest.fn(),
                };
            });
    });
    beforeEach(() => {
        upsert.mockClear();
        dbQueryTimeout = "dbQueryTimeout";
        counter = 0;
    });

    it("upserts creates document", async () => {
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        await sink.sink(
            iterate([
                {
                    state: new StateRef({}, "key1", currentSn),
                    message: {
                        type: DummyState.name,
                        payload: { value: "test" },
                    },
                    spanContext,
                    original: new MessageRef(
                        {
                            [EventSourcedMetadata.Stream]: "stream",
                            [EventSourcedMetadata.SequenceNumber]: 5,
                        },
                        null,
                        undefined
                    ),
                },
            ]),
            bail
        );

        const expected: ICosmosDocument = {
            id: "key1",
            stream_id: "key1",
            sn: 2,
            data: { value: "test" },
            event_type: DummyState.name,
            trace: spanContext,
            dt: expect.anything(),
            metadata: {
                source: {
                    stream_id: "stream",
                    sn: 5,
                },
            },
        };

        expect(bailed).toHaveBeenCalledTimes(0);
        expect(upsert).lastCalledWith(
            expect.objectContaining(expected),
            expected.stream_id,
            currentSn
        );
    });

    it("upserts last document per key", async () => {
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        const streamId = "key1";
        await sink.sink(
            iterate([
                {
                    state: new StateRef({}, streamId, currentSn),
                    message: {
                        type: DummyState.name,
                        payload: { value: "foo" },
                    },
                    spanContext,
                    original: new MessageRef({}, null),
                },
                {
                    state: new StateRef({}, streamId, currentSn),
                    message: {
                        type: DummyState.name,
                        payload: { value: "bar" },
                    },
                    spanContext,
                    original: new MessageRef({}, null, undefined),
                },
            ]),
            bail
        );

        expect(bailed).toHaveBeenCalledTimes(0);
        expect(upsert).lastCalledWith(
            expect.objectContaining({ sn: 3, data: { value: "bar" } }),
            streamId,
            currentSn
        );
    });

    it("upserts existing document that will be deleted", async () => {
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        const streamId = "key1";
        await sink.sink(
            iterate([
                {
                    state: new StateRef({}, streamId, currentSn),
                    message: {
                        type: DummyState.name,
                        payload: { value: "foo" },
                    },
                    spanContext,
                    original: new MessageRef({}, null),
                },
                {
                    state: new StateRef({}, streamId, currentSn),
                    message: {
                        type: DummyState.name,
                        payload: null,
                    },
                    spanContext,
                    original: new MessageRef({}, null, undefined),
                },
            ]),
            bail
        );

        expect(bailed).toHaveBeenCalledTimes(0);
        expect(upsert).lastCalledWith(
            expect.objectContaining({ sn: 3, data: undefined }),
            streamId,
            currentSn
        );
    });
    it("upsert that returns a non 400 error", async () => {
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, not400ErrorKey, currentSn),
                        message: {
                            type: DummyState.name,
                            payload: { value: "test" },
                        },
                        spanContext,
                        original: new MessageRef({}, null, undefined),
                    },
                ]),
                bail
            )
        ).rejects.toMatchObject({
            code: 500,
            body: "Internal Server Error",
        });

        expect(bailed).toHaveBeenCalledTimes(1);
        expect(upsert).lastCalledWith(
            expect.objectContaining({ sn: 2, data: { value: "test" } }),
            not400ErrorKey,
            currentSn
        );
    });

    it("upsert that returns optimistic concurrency error", async () => {
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, optimisticConcurrencyKey, currentSn),
                        message: {
                            type: DummyState.name,
                            payload: { value: "test" },
                        },
                        spanContext,
                        original: new MessageRef({}, null, undefined),
                    },
                ]),
                bail
            )
        ).rejects.toMatchObject(
            new SequenceConflictError({
                key: optimisticConcurrencyKey,
                newSn: 0,
                expectedSn: 0,
                actualSn: 0,
            })
        );

        expect(bailed).toHaveBeenCalledTimes(1);
        expect(upsert).lastCalledWith(
            expect.objectContaining({ sn: 2, data: { value: "test" } }),
            optimisticConcurrencyKey,
            currentSn
        );
    });

    it("upserts that successfully retries for different errors returned from sproc", async () => {
        const expectedKey = dbQueryTimeout;
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        const retrier = createRetrier({
            exponentBase: 1,
            maxRetryIntervalMs: 10,
            mode: ErrorHandlingMode.LogAndRetryOrFail,
            randomize: false,
            retries: 5,
            retryIntervalMs: 1,
            retryMode: RetryMode.Linear,
        });
        await expect(
            retrier.retry(async (bail: (err: any) => never) => {
                try {
                    await sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, dbQueryTimeout, currentSn),
                                message: {
                                    type: DummyState.name,
                                    payload: { value: "test" },
                                },
                                spanContext,
                                original: new MessageRef({}, null, undefined),
                            },
                        ]),
                        bail
                    );
                } catch (e) {
                    throw e;
                }
            })
        ).resolves.toBe(undefined);
        expect(upsert).toHaveBeenCalledTimes(numErrors + 1);
        expect(upsert).lastCalledWith(
            expect.objectContaining({ sn: 2, data: { value: "test" } }),
            expectedKey,
            currentSn
        );
        upsert.mockClear();
    });

    it("upserts using a message encoder that only satisfies IMessageEncoder", async () => {
        const encoder = new DummyMessageEncoder();
        const config: ICosmosConfiguration = {
            url: "test",
            key: "test",
            collectionId: "test",
            databaseId: "test",
            encoder,
        };
        const sink = new CosmosOutputSink(config);
        const currentSn = 1;
        await sink.sink(
            iterate([
                {
                    state: new StateRef({}, "key1", currentSn),
                    message: {
                        type: DummyState.name,
                        payload: { value: "test" },
                    },
                    spanContext,
                    original: new MessageRef(
                        {
                            [EventSourcedMetadata.Stream]: "stream",
                            [EventSourcedMetadata.SequenceNumber]: 5,
                        },
                        null,
                        undefined
                    ),
                },
            ]),
            bail
        );

        const data = encoder.encode({ type: "testType", payload: { value: "test" } });
        const expected: ICosmosDocument = {
            id: "key1",
            stream_id: "key1",
            sn: 2,
            data,
            event_type: DummyState.name,
            trace: spanContext,
            dt: expect.anything(),
            metadata: {
                source: {
                    stream_id: "stream",
                    sn: 5,
                },
            },
        };

        expect(bailed).toHaveBeenCalledTimes(0);
        expect(upsert).lastCalledWith(
            expect.objectContaining(expected),
            expected.stream_id,
            currentSn
        );
    });
});
