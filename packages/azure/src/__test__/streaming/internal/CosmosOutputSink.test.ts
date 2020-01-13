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
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { ICosmosConfiguration } from "../../..";
import { CosmosOutputSink } from "../../../streaming/internal";
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

function generateMetadata(key: string): IMetadata {
    return {
        key,
    };
}

const retries = 5;

describe("streaming CosmosOutputSink", () => {
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
        [EventSourcedMetadata.SequenceNumber]: 2,
    };
    const someMessage: IMessage = {
        type: DummyState.name,
        payload: { value: "test" },
    };
    const payload = {
        message: someMessage,
        spanContext: new SpanContext(),
        original: new MessageRef(someMetadata, { type: "test", payload: null }, undefined),
    };
    const remainingFields = {
        dt: expect.any(Number),
        encodedData: someEncoder.encode(someMessage),
        event_type: DummyState.name,
        metadata: {
            source: {
                stream_id: "stream",
                sn: 2,
            },
        },
    };
    let bulkInsert: jest.Mock;
    const verifySn = false;
    const regularKey1 = "key1";
    const not400ErrorKey = "not400Error";
    const unknown400ErrorKey = "unknown400Error";
    let tooManyRequestsErrorKey = "tooMany";
    let counter = 0;
    const numErrors = 5;
    const ms = 11;
    const tooManyRequestErrorBody = `DB Query returned FALSE: createDocument failed on document at index: 0 stream_id: ${tooManyRequestsErrorKey}, sn: 0.`; // keep the strings synced to ../resources/bulkInsertSproc.js
    beforeEach(() => {
        (bulkInsert = jest.fn().mockImplementation((_, partitionKey) => {
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
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(not400ErrorKey),
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
                    stream_id: not400ErrorKey,
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
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(unknown400ErrorKey),
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
                    stream_id: unknown400ErrorKey,
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
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(regularKey1),
                        ...payload,
                    },
                    {
                        metadata: generateMetadata(regularKey1),
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
                    stream_id: regularKey1,
                    ...remainingFields,
                }),
                expect.objectContaining({
                    stream_id: regularKey1,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });

    it("successfully calls retry.setNextRetryInterval when it sees the RETRY_AFTER_MS header", async () => {
        const retry = createRetrierContext(retries + 1);
        const spyBail = jest.spyOn(retry, "bail");
        const spySetNextRetryInterval = jest.spyOn(retry, "setNextRetryInterval");
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(tooManyRequestsErrorKey),
                        ...payload,
                    },
                ]),
                retry
            )
        ).rejects.toMatchObject({
            code: 429,
            body: { message: tooManyRequestErrorBody },
        });
        expect(spySetNextRetryInterval).toHaveBeenCalledWith(ms);
        expect(spyBail).toHaveBeenCalledTimes(0);
        expect(bulkInsert).toHaveBeenCalledTimes(1);
        expect(bulkInsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    stream_id: tooManyRequestsErrorKey,
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
                                metadata: generateMetadata(tooManyRequestsErrorKey),
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
                    stream_id: expectedDocumentKey,
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
        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(regularKey1),
                        ...payload,
                    },
                    {
                        metadata: generateMetadata(regularKey1),
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
                    stream_id: regularKey1,
                    ...remainingFields,
                }),
                expect.objectContaining({
                    stream_id: regularKey1,
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
                    sn: 2,
                },
            },
        };

        const sink = new CosmosOutputSink(config);
        await expect(
            sink.sink(
                iterate([
                    {
                        metadata: generateMetadata(regularKey1),
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
                    stream_id: regularKey1,
                    ...remainingFields,
                }),
            ]),
            regularKey1,
            verifySn
        );
    });
});
