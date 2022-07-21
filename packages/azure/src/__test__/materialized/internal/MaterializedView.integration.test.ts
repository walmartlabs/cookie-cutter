/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    iterate,
    JsonMessageEncoder,
    MessageRef,
    SequenceConflictError,
    StateRef,
    createRetrierContext,
} from "@walmartlabs/cookie-cutter-core";
import { CosmosOutputSink, CosmosStateProvider } from "../../../materialized/internal";
import { CosmosClient } from "../../../utils";
import { DummyState } from "../../dummystate";
import { setup, teardown } from "../../integrationSetup";

jest.setTimeout(90000);

const url = "https://localhost:8081";
const key = process.env.COSMOS_SECRET_KEY;
const databaseId = "materialized-view-integration-test";
const collectionId = "data";
const newCollectionId = "data2";
const encoder = new JsonMessageEncoder();
const retrier = createRetrierContext(1);
const sink = new CosmosOutputSink({ url, key, databaseId, collectionId, encoder });
const client = new CosmosClient({ url, key, databaseId, collectionId, encoder });
const newSink = new CosmosOutputSink({
    url,
    key,
    databaseId,
    collectionId: newCollectionId,
    encoder,
});

function validateKeys(key: string) {
    if (!key) {
        throw new Error("COSMOS_SECRET_KEY env is not set");
    }
}

beforeAll(async () => {
    validateKeys(key);
    await setup([
        { databaseId, collectionId },
        { databaseId, collectionId: newCollectionId },
    ]);
});

afterAll(async () => {
    await teardown([databaseId]);
});

describe("Materialized Views", () => {
    const spanContext = {};
    describe("CosmosOutputSink and CosmosStateProvider", () => {
        it("creates a new materialized view document and retrieves it", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `non-existing-stream-${currentTime.getTime()}`;
            const payload = { value: "foo" };
            await sink.sink(
                iterate([
                    {
                        state: new StateRef({}, streamId, currentSn),
                        message: {
                            type: DummyState.name,
                            payload,
                        },
                        spanContext,
                        original: new MessageRef({}, null),
                    },
                ]),
                undefined
            );

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, streamId);
            expect(stateRef).toMatchObject({
                state: new DummyState({ value: "foo" }),
                key: streamId,
                seqNum: currentSn + 1,
            });
        });
        it("updates an existing materialized view document and retrieves it", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `existing-stream-${currentTime.getTime()}`;
            const originalPayload = { value: "foo" };
            const updatedPayload = { value: "bar" };
            const requests: [any, number][] = [
                [originalPayload, currentSn],
                [updatedPayload, currentSn + 1],
            ];
            for (const [payload, sn] of requests) {
                await sink.sink(
                    iterate([
                        {
                            state: new StateRef({}, streamId, sn),
                            message: {
                                type: DummyState.name,
                                payload,
                            },
                            spanContext,
                            original: new MessageRef({}, null),
                        },
                    ]),
                    undefined
                );
            }

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, streamId);
            expect(stateRef).toMatchObject({
                state: new DummyState({ value: "bar" }),
                key: streamId,
                seqNum: currentSn + 2,
            });
        });
        it("soft deletes an existing document and retrieves deleted document", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `delete-${currentTime.getTime()}`;
            const originalPayload = { value: "foo" };
            const updatedPayload = null;
            const requests: [any, number][] = [
                [originalPayload, currentSn],
                [updatedPayload, currentSn + 1],
            ];
            for (const [payload, sn] of requests) {
                await sink.sink(
                    iterate([
                        {
                            state: new StateRef({}, streamId, sn),
                            message: {
                                type: DummyState.name,
                                payload,
                            },
                            spanContext,
                            original: new MessageRef({}, null),
                        },
                    ]),
                    undefined
                );
            }

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, streamId);
            expect(stateRef).toMatchObject({
                state: new DummyState(),
                key: streamId,
                seqNum: currentSn + 2,
            });
        });
    });
    describe("CosmosStateProvider", () => {
        it("retrieves a non-existent document", async () => {
            const streamId = "incorrect-stream-id";
            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, "incorrect-stream-id");
            expect(stateRef).toMatchObject({
                state: new DummyState(),
                key: streamId,
                seqNum: 0,
            });
        });

        it("retrieves a document in the default collection", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `default-collection-stream-${currentTime.getTime()}`;
            const payload = { value: "foo" };
            await sink.sink(
                iterate([
                    {
                        state: new StateRef({}, streamId, currentSn),
                        message: {
                            type: DummyState.name,
                            payload,
                        },
                        spanContext,
                        original: new MessageRef({}, null),
                    },
                ]),
                undefined
            );

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, streamId);
            expect(stateRef).toMatchObject({
                state: new DummyState({ value: "foo" }),
                key: streamId,
                seqNum: currentSn + 1,
            });
        });

        it("retrieves a document in an unknown collection", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `non-default-collection-stream-${currentTime.getTime()}`;
            const payload = { value: "foo" };
            await newSink.sink(
                iterate([
                    {
                        state: new StateRef({}, streamId, currentSn),
                        message: {
                            type: DummyState.name,
                            payload,
                        },
                        spanContext,
                        original: new MessageRef({}, null),
                    },
                ]),
                undefined
            );

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());

            expect.assertions(2);
            try {
                await state.get(undefined, `@unknown/${streamId}`);
            } catch (error) {
                expect((error as any).code).toBe(404);
                expect((error as any).body.message).toContain("Resource Not Found");
            }
        });

        it("retrieves a document in a given collection", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `non-default-collection-stream-${currentTime.getTime()}`;
            const payload = { value: "foo" };
            await newSink.sink(
                iterate([
                    {
                        state: new StateRef({}, streamId, currentSn),
                        message: {
                            type: DummyState.name,
                            payload,
                        },
                        spanContext,
                        original: new MessageRef({}, null),
                    },
                ]),
                undefined
            );

            const state = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
            const stateRef = await state.get(undefined, `@${newCollectionId}/${streamId}`);
            expect(stateRef).toMatchObject({
                state: new DummyState({ value: "foo" }),
                key: `@${newCollectionId}/${streamId}`,
                seqNum: currentSn + 1,
            });
        });
    });
    describe("CosmosOutputSink", () => {
        it("deletes a non-existent document", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `delete-non-existing-${currentTime.getTime()}`;
            await expect(
                sink.sink(
                    iterate([
                        {
                            state: new StateRef({}, streamId, currentSn),
                            message: {
                                type: DummyState.name,
                                payload: null,
                            },
                            spanContext,
                            original: new MessageRef({}, null),
                        },
                    ]),
                    undefined
                )
            ).resolves.toBeUndefined();
        });

        it("fails to upsert a document due to sequence number conflict for wrong originalSn", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `wrong-originalSn-${currentTime.getTime()}`;
            const originalPayload = { value: "foo" };
            const updatedPayload = { value: "bar" };
            const requests: [any, number][] = [
                [originalPayload, currentSn],
                [updatedPayload, 999],
            ];

            expect.assertions(2);
            try {
                for (const [payload, sn] of requests) {
                    await sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, streamId, sn),
                                message: {
                                    type: DummyState.name,
                                    payload,
                                },
                                spanContext,
                                original: new MessageRef({}, null),
                            },
                        ]),
                        retrier
                    );
                }
            } catch (e) {
                expect(e).toBeInstanceOf(SequenceConflictError);
                expect((e as any).details).toMatchObject({
                    key: streamId,
                    newSn: 1000,
                    expectedSn: 999,
                    actualSn: 1,
                });
            }
        });
        it("fails to upsert a document for sequence number conflict with SN being less than existing doc's sn", async () => {
            const currentTime = new Date();
            const currentSn = 10;
            const streamId = `less-than-sn-${currentTime.getTime()}`;
            const originalPayload = { value: "foo" };
            const updatedPayload = { value: "bar" };
            const requests: [any, number][] = [
                [originalPayload, currentSn],
                [updatedPayload, 1],
            ];

            expect.assertions(2);
            try {
                for (const [payload, sn] of requests) {
                    await sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, streamId, sn),
                                message: {
                                    type: DummyState.name,
                                    payload,
                                },
                                spanContext,
                                original: new MessageRef({}, null),
                            },
                        ]),
                        retrier
                    );
                }
            } catch (e) {
                expect(e).toBeInstanceOf(SequenceConflictError);
                expect((e as any).details).toMatchObject({
                    key: streamId,
                    newSn: 2,
                    expectedSn: 1,
                    actualSn: 11,
                });
            }
        });

        it("upserts for one of two requests executed in parallel with the same originalSn", async () => {
            const currentTime = new Date();
            const currentSn = 0;
            const streamId = `occ-error-${currentTime.getTime()}`;
            const payload = { value: "foo" };
            await sink.sink(
                iterate([
                    {
                        state: new StateRef({}, streamId, currentSn),
                        message: {
                            type: DummyState.name,
                            payload,
                        },
                        spanContext,
                        original: new MessageRef({}, null),
                    },
                ]),
                undefined
            );

            const originalSn = currentSn + 1;
            const p: boolean[] = await Promise.all<boolean>(
                [
                    sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, streamId, originalSn),
                                message: {
                                    type: DummyState.name,
                                    payload: { value: "bar1" },
                                },
                                spanContext,
                                original: new MessageRef({}, null),
                            },
                        ]),
                        undefined
                    ),
                    sink.sink(
                        iterate([
                            {
                                state: new StateRef({}, streamId, originalSn),
                                message: {
                                    type: DummyState.name,
                                    payload: { value: "bar2" },
                                },
                                spanContext,
                                original: new MessageRef({}, null),
                            },
                        ]),
                        undefined
                    ),
                ].map((v: Promise<void>): Promise<boolean> => {
                    return new Promise<boolean>((resolve) => {
                        v.then(() => resolve(true)).catch(() => resolve(false));
                    });
                })
            );

            expect(p).not.toBe([true, true]);
        });
    });
});
