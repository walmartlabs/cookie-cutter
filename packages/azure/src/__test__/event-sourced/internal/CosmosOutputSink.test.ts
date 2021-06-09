/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    createRetrier,
    createRetrierContext,
    ErrorHandlingMode,
    EventSourcedMetadata,
    IMessage,
    IMetadata,
    iterate,
    JsonMessageEncoder,
    MessageRef,
    RetrierContext,
    RetryMode,
    SequenceConflictError,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { ICosmosConfiguration, CosmosMetadata } from "../../..";
import { CosmosOutputSink } from "../../../event-sourced/internal";
import { CosmosClient, RETRY_AFTER_MS } from "../../../utils/CosmosClient";
import { DummyMessageEncoder } from "../../dummyEncoder";
import { DummyState } from "../../dummystate";

jest.mock("../../../utils/CosmosClient", () => {
    const { RETRY_AFTER_MS } = jest.requireActual("../../../utils/CosmosClient");
    return {
        CosmosClient: jest.fn(),
        RETRY_AFTER_MS,
    };
});
const MockCosmosClient: jest.Mock = CosmosClient as any;

const retries = 5;

describe("event-sourced CosmosOutputSink", () => {
    const someEncoder = new DummyMessageEncoder();
    const config: ICosmosConfiguration = {
        url: "test",
        key: "test",
        collectionId: "test",
        databaseId: "test",
        encoder: someEncoder,
    };
    const someMetadata: IMetadata = {
        [EventSourcedMetadata.Stream]: "stream",
        [EventSourcedMetadata.SequenceNumber]: 1,
    };
    const someMessage: IMessage = {
        type: DummyState.name,
        payload: { value: "test" },
    };
    const payload = {
        message: someMessage,
        spanContext: {},
        original: new MessageRef(someMetadata, { type: "test", payload: null }, undefined),
    };
    const remainingFields = {
        dt: expect.any(Number),
        encodedData: someEncoder.encode(someMessage),
        event_type: DummyState.name,
        metadata: {
            source: {
                stream_id: "stream",
                sn: 1,
            },
        },
    };
    let bulkInsert: jest.Mock;
    const verifySn = true;
    const regularKey1 = "key1";
    const seqNumAlreadyUsedErrorKey = "seqNum";
    const not400ErrorKey = "not400Error";
    const unknown400ErrorKey = "unknown400Error";
    let tooManyRequestsErrorKey = "tooMany";
    let counter = 0;
    const numErrors = 5;
    const ms = 11;
    const sequenceErrorBody = `Sequence Conflict for document at index: 0, stream_id: ${seqNumAlreadyUsedErrorKey}, new sn: 0, expected sn: 0, actual sn: 0.`; // keep the strings synced to ../resources/bulkInsertSproc.js
    const tooManyRequestErrorBody = `DB Query returned FALSE: createDocument failed on document at index: 0, stream_id: 0, sn: 0.`; // keep the strings synced to ../resources/bulkInsertSproc.js
    beforeEach(() => {
        (bulkInsert = jest.fn().mockImplementation((_, partitionKey) => {
            if (partitionKey === seqNumAlreadyUsedErrorKey) {
                throw {
                    code: 400,
                    body: { message: sequenceErrorBody },
                };
            }
            if (partitionKey === tooManyRequestsErrorKey) {
                counter++;
                if (counter >= numErrors + 1) {
                    tooManyRequestsErrorKey = regularKey1;
                    return;
                }
                throw {
                    code: 429,
                    body: { message: tooManyRequestErrorBody },
                    headers: { [RETRY_AFTER_MS]: ms },
                };
            }
            if (partitionKey === unknown400ErrorKey) {
                throw {
                    code: 400,
                    body: { message: unknown400ErrorKey },
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
                    upsert: jest.fn(),
                    bulkInsert,
                };
            });
    });
    afterEach(() => {
        tooManyRequestsErrorKey = "tooMany";
        counter = 0;
    });

    it("throws a non 400 error thrown by bulkInsert", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, not400ErrorKey, expSeqNum),
                        ...payload,
                    },
                ]),
                retry
            )
        ).rejects.toMatchObject({
            code: 500,
            body: "Internal Server Error",
        });
        expect(spyBail).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${not400ErrorKey}-${expSeqNum + 1}`,
                    stream_id: not400ErrorKey,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
            ]),
            not400ErrorKey,
            verifySn
        );
    });

    it("throws an unexpected 400 error thrown by bulkInsert", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, unknown400ErrorKey, expSeqNum),
                        ...payload,
                    },
                ]),
                retry
            )
        ).rejects.toMatchObject({
            code: 400,
            body: { message: unknown400ErrorKey },
        });
        expect(spyBail).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${unknown400ErrorKey}-${expSeqNum + 1}`,
                    stream_id: unknown400ErrorKey,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
            ]),
            unknown400ErrorKey,
            verifySn
        );
    });

    it("does not call bulkInsert with empty docs", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const sink = new CosmosOutputSink(config);
        await expect(sink.sink(iterate([]), retry)).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(0);
    });

    it("succeeds in writing events with sequentially numbered state refs", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNumKey1 = 1;
        const expSeqNumKey2 = 2;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, regularKey1, expSeqNumKey1),
                        ...payload,
                    },
                    {
                        state: new StateRef({}, regularKey1, expSeqNumKey2),
                        ...payload,
                    },
                ]),
                retry
            )
        ).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNumKey1 + 1}`,
                    stream_id: regularKey1,
                    sn: expSeqNumKey1 + 1,
                    ...remainingFields,
                }),
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNumKey2 + 1}`,
                    stream_id: regularKey1,
                    sn: expSeqNumKey2 + 1,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });

    it("throws a SequenceConflictError when bulkInsert throws a sequence conflict error", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, seqNumAlreadyUsedErrorKey, expSeqNum),
                        ...payload,
                    },
                ]),
                retry
            )
        ).rejects.toMatchObject(
            new SequenceConflictError({
                key: seqNumAlreadyUsedErrorKey,
                newSn: 0,
                expectedSn: 0,
                actualSn: 0,
            })
        );
        expect(spyBail).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${seqNumAlreadyUsedErrorKey}-${expSeqNum + 1}`,
                    stream_id: seqNumAlreadyUsedErrorKey,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
            ]),
            seqNumAlreadyUsedErrorKey,
            verifySn
        );
    });

    it("successfully calls retry.setNextRetryInterval when it sees the RETRY_AFTER_MS header", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const spySetNextRetryInterval = jest.spyOn(retry, "setNextRetryInterval");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, tooManyRequestsErrorKey, expSeqNum),
                        ...payload,
                    },
                ]),
                retry
            )
        ).rejects.toMatchObject({
            code: 429,
            body: { message: tooManyRequestErrorBody },
            headers: { [RETRY_AFTER_MS]: ms },
        });
        expect(spySetNextRetryInterval).toHaveBeenCalledWith(ms);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${tooManyRequestsErrorKey}-${expSeqNum + 1}`,
                    stream_id: tooManyRequestsErrorKey,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
            ]),
            tooManyRequestsErrorKey,
            verifySn
        );
    });

    it("successfully retries for event that throws TooManyRequestsError", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expectedDocumentKey = tooManyRequestsErrorKey;
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
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
            retrier.retry(async (retry: RetrierContext) => {
                try {
                    await sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, tooManyRequestsErrorKey, expSeqNum),
                                ...payload,
                            },
                        ]),
                        retry
                    );
                } catch (e) {
                    throw e;
                }
            })
        ).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(numErrors + 1);
        expect(bulkInsert).toHaveBeenLastCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${expectedDocumentKey}-${expSeqNum + 1}`,
                    stream_id: expectedDocumentKey,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
            ]),
            expectedDocumentKey,
            verifySn
        );
    });

    it("succeeds in writing events with the same state ref", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, regularKey1, expSeqNum),
                        ...payload,
                    },
                    {
                        state: new StateRef({}, regularKey1, expSeqNum),
                        ...payload,
                    },
                ]),
                retry
            )
        ).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNum + 1}`,
                    stream_id: regularKey1,
                    sn: expSeqNum + 1,
                    ...remainingFields,
                }),
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNum + 2}`,
                    stream_id: regularKey1,
                    sn: expSeqNum + 2,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });

    it("succeeds in writing events with TTL metadata", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const expSeqNum = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, regularKey1, expSeqNum),
                        ...payload,
                        metadata: {
                            [CosmosMetadata.TTL]: 20,
                        },
                    },
                    {
                        state: new StateRef({}, regularKey1, expSeqNum),
                        ...payload,
                        metadata: {
                            [CosmosMetadata.TTL]: 40,
                        },
                    },
                ]),
                retry
            )
        ).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNum + 1}`,
                    stream_id: regularKey1,
                    sn: expSeqNum + 1,
                    ttl: 20,
                    ...remainingFields,
                }),
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNum + 2}`,
                    stream_id: regularKey1,
                    sn: expSeqNum + 2,
                    ttl: 40,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });

    it("succeeds in writing events using a message encoder that satisfies IEncodedMessageEmbedder", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const jsonEncoder = new JsonMessageEncoder();
        const config: ICosmosConfiguration = {
            url: "test",
            key: "test",
            collectionId: "test",
            databaseId: "test",
            encoder: jsonEncoder,
        };

        const buffer = jsonEncoder.encode(someMessage);
        const encodedData = jsonEncoder.toJsonEmbedding(buffer);
        const remainingFields = {
            dt: expect.any(Number),
            encodedData,
            event_type: DummyState.name,
            metadata: {
                source: {
                    stream_id: "stream",
                    sn: 1,
                },
            },
        };

        const expSeqNumKey1 = 1;
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        state: new StateRef({}, regularKey1, expSeqNumKey1),
                        ...payload,
                    },
                ]),
                retry
            )
        ).resolves.toBe(undefined);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: `${regularKey1}-${expSeqNumKey1 + 1}`,
                    stream_id: regularKey1,
                    sn: expSeqNumKey1 + 1,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });
});
