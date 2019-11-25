/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    createRetrier,
    ErrorHandlingMode,
    EventSourcedMetadata,
    IMessage,
    IMetadata,
    iterate,
    JsonMessageEncoder,
    MessageRef,
    RetryMode,
    SequenceConflictError,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { ICosmosConfiguration } from "../../..";
import { CosmosOutputSink } from "../../../event-sourced/internal";
import { CosmosClient } from "../../../utils/CosmosClient";
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
                bail
            )
        ).rejects.toMatchObject({
            code: 500,
            body: "Internal Server Error",
        });
        expect(bailed).toHaveBeenCalledTimes(1);
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
                bail
            )
        ).rejects.toMatchObject({
            code: 400,
            body: { message: unknown400ErrorKey },
        });
        expect(bailed).toHaveBeenCalledTimes(1);
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
        const sink = new CosmosOutputSink(config);
        await expect(sink.sink(iterate([]), bail)).resolves.toBe(undefined);
        expect(bailed).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(0);
    });

    it("succeeds in writing events with sequentially numbered state refs", async () => {
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
                bail
            )
        ).resolves.toBe(undefined);
        expect(bailed).toHaveBeenCalledTimes(0);
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
                bail
            )
        ).rejects.toMatchObject(
            new SequenceConflictError({
                key: seqNumAlreadyUsedErrorKey,
                newSn: 0,
                expectedSn: 0,
                actualSn: 0,
            })
        );
        expect(bailed).toHaveBeenCalledTimes(1);
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

    it("successfully retries for event that throws TooManyRequestsError", async () => {
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
            retrier.retry(async (bail: (err: any) => never) => {
                try {
                    await sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, tooManyRequestsErrorKey, expSeqNum),
                                ...payload,
                            },
                        ]),
                        bail
                    );
                } catch (e) {
                    throw e;
                }
            })
        ).resolves.toBe(undefined);
        expect(bailed).toHaveBeenCalledTimes(0);
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
                bail
            )
        ).resolves.toBe(undefined);
        expect(bailed).toHaveBeenCalledTimes(0);
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

    it("succeeds in writing events using a message encoder that satisfies IEncodedMessageEmbedder", async () => {
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
                bail
            )
        ).resolves.toBe(undefined);
        expect(bailed).toHaveBeenCalledTimes(0);
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
