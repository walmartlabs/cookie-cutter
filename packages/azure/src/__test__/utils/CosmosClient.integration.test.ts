/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    isEmbeddable,
    iterate,
    JsonMessageEncoder,
    MessageRef,
    StateRef,
    NullMetrics,
    NullLogger,
    NullTracerBuilder,
} from "@walmartlabs/cookie-cutter-core";
import { CosmosClient } from "../../utils";
import { setup, teardown } from "../integrationSetup";
import { CosmosOutputSink } from "../../event-sourced/internal";
import { cosmosMetadata, ICosmosDocument } from "../../utils";
import { SpanContext } from "opentracing";
import { isNullOrUndefined } from "util";

jest.setTimeout(90000);

const databaseId = "cosmos-client-integration-test";
const collectionId = "data";
const encoder = new JsonMessageEncoder();
const url = "https://localhost:8081";
const key = process.env.COSMOS_SECRET_KEY;
const currentTime = new Date();
const streamId = `cosmosClient-${currentTime.getTime()}`;

const getAllEventsQuery: string = `SELECT * FROM root r WHERE r.stream_id=@stream_id AND r.sn >= @sn ORDER BY r.sn ASC`;
const getTopNEventsQuery: string = `SELECT TOP @max * FROM root r WHERE r.stream_id=@stream_id AND r.sn >= @sn ORDER BY r.sn ASC`;
const getSequenceNumer: string = `SELECT TOP 1 c.sn FROM c ORDER BY c.sn DESC`;
const numberOfEvents = 5;

const client = new CosmosClient({
    url,
    key,
    databaseId,
    collectionId,
    encoder,
});

const sink = new CosmosOutputSink({
    url,
    key,
    databaseId,
    collectionId,
    encoder,
});

function validateKeys(key: string) {
    if (!key) {
        throw new Error("COSMOS_SECRET_KEY env is not set");
    }
}

beforeAll(async () => {
    validateKeys(key);

    await setup([{ databaseId, collectionId }]);
    await client.initialize({
        logger: new NullLogger(),
        metrics: new NullMetrics(),
        tracer: new NullTracerBuilder().create(),
    });

    const spanContext = {};

    for (let i = 0; i < numberOfEvents; i++) {
        await sink.sink(
            iterate([
                {
                    state: new StateRef({}, streamId, i),
                    message: {
                        type: "test",
                        payload: {},
                    },
                    spanContext,
                    original: new MessageRef({}, null),
                },
            ]),
            undefined
        );
    }
});

afterAll(async () => {
    await teardown([databaseId]);
});

describe("cosmosClient", () => {
    it("validates query returns max number of events when specifying max events", async () => {
        const result = await client.query(undefined, {
            query: getTopNEventsQuery,
            parameters: [
                { name: "@stream_id", value: streamId },
                { name: "@sn", value: 1 },
                { name: "@max", value: 3 },
            ],
        });
        expect(result).toHaveLength(3);
    });

    it("validates query returns max number of events when not specifying max events", async () => {
        const result = await client.query(undefined, {
            query: getAllEventsQuery,
            parameters: [
                { name: "@stream_id", value: streamId },
                { name: "@sn", value: 1 },
            ],
        });
        expect(result).toHaveLength(numberOfEvents);
    });

    it("performs queries on specified colleections", async () => {
        const result = await client.query(undefined, {
            query: getSequenceNumer,
            parameters: [],
        });

        expect(result).toHaveLength(1);
        expect(result[0].sn).toBeDefined();
    });

    it("executes bulk inserts", async () => {
        const records = [];
        const firstSn = await getCurrentSn();

        for (let i = 0; i < 9; i++) {
            records.push(await generateTestDocument("test data", firstSn + i));
        }

        await client.bulkInsert(records, streamId, true);

        const secondSn = await getCurrentSn();

        expect(firstSn).toBeLessThan(secondSn);
    });

    it("verifies sequence numbers on bulk inserts if configured to", async () => {
        const records = [];
        for (let i = 0; i < 2; i++) {
            records.push(await generateTestDocument("test data", 1));
        }

        expect.assertions(1);
        try {
            await client.bulkInsert(records, streamId, true);
        } catch (error) {
            expect(JSON.stringify(error)).toContain("Error: Sequence Conflict for document");
        }
    });

    it("executes upserts", async () => {
        const newStreamId = `cosmosClient-${Date.now()}`;
        const currSn = await getCurrentSn();

        const record = await generateTestDocument("test data", currSn ? currSn : 0, newStreamId);

        await client.upsert(record, newStreamId, currSn ? currSn : 0);

        const newSn = await getCurrentSn();

        expect(currSn).toBeLessThan(newSn);
    });
});

async function generateTestDocument(
    payload: string,
    sn?: number,
    sId?: string
): Promise<ICosmosDocument> {
    if (!sn) {
        sn = await getCurrentSn();
    }

    const message = {
        type: "test",
        payload,
    };
    const messageRef = new MessageRef({ key: collectionId }, message);

    return {
        stream_id: sId ?? streamId,
        sn: sn + 1,
        event_type: "test",
        data: isNullOrUndefined(message.payload) ? undefined : formatData(message),
        id: `${streamId}-${sn + 1}`,
        trace: new SpanContext(),
        dt: Date.now(),
        metadata: {
            ...cosmosMetadata(messageRef),
        },
    };

    function formatData(msg: any): any {
        const buffer = encoder.encode(msg);
        if (isEmbeddable(encoder)) {
            return encoder.toJsonEmbedding(buffer);
        }
        return buffer;
    }
}

async function getCurrentSn(): Promise<number> {
    return (
        await client.query(undefined, {
            query: getSequenceNumer,
            parameters: [],
        })
    )[0]?.sn;
}
