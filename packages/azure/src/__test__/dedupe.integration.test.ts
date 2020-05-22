/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    EventSourcedMetadata,
    IDispatchContext,
    JsonMessageEncoder,
    MessageRef,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { EventSourced, ICosmosConfiguration, Materialized, Streaming } from "..";
import { cosmosDeduper } from "../event-sourced";
import { CosmosClient } from "../utils";

class InputMessage {
    constructor(public readonly value: string) {}
}

class State {
    public value: string | undefined;

    constructor(snapshot: any) {
        if (snapshot) {
            this.value = snapshot.value;
        }
    }

    public snap(): any {
        return { value: this.value };
    }
}

function msg(streamId: string, sn: number): MessageRef {
    return new MessageRef(
        {
            [EventSourcedMetadata.Stream]: streamId,
            [EventSourcedMetadata.SequenceNumber]: sn,
        },
        {
            type: InputMessage.name,
            payload: new InputMessage(`hello ${streamId}@${sn}`),
        }
    );
}

// TODO: change this once we can run integration
// tests with Cosmos in CI
const COSMOS_CONFIG: ICosmosConfiguration = {
    collectionId: "data",
    databaseId: "test-cookie-cutter-sebastian",
    encoder: new JsonMessageEncoder(),
    url: "https://carrot.documents.azure.com:443/",
    key: process.env.COSMOS_SECRET_KEY_DEFAULT,
};

describe.skip("Message Deduplication for Streaming", () => {
    const STREAM_1 = `stream-${Date.now()}`;
    const STREAM_2 = `stream-${Date.now() + 1}`;

    const TEST_DATA: MessageRef[] = [
        msg(STREAM_1, 1),
        msg(STREAM_1, 2),
        msg(STREAM_1, 3),
        msg(STREAM_2, 1),
        msg(STREAM_1, 2), // a dupe
        msg(STREAM_2, 2),
    ];

    it("handles each message exactly once", async () => {
        for (let i = 0; i < 2; i++) {
            await Application.create()
                .input()
                .add(new StaticInputSource(TEST_DATA))
                .dedupe(cosmosDeduper(COSMOS_CONFIG))
                .done()
                .dispatch({
                    onInputMessage(msg: InputMessage, ctx: IDispatchContext) {
                        ctx.publish(InputMessage, msg, {
                            key: ctx.metadata<string>(EventSourcedMetadata.Stream),
                        });
                    },
                })
                .output()
                .published(Streaming.cosmosSink(COSMOS_CONFIG))
                .done()
                .run();
        }

        const client = new CosmosClient(COSMOS_CONFIG);
        const data = await client.query(undefined, {
            query: "SELECT * FROM c WHERE c.stream_id=@s1 OR c.stream_id=@s2",
            parameters: [
                { name: "@s1", value: STREAM_1 },
                { name: "@s2", value: STREAM_2 },
            ],
        });

        expect(data.length).toBe(TEST_DATA.length - 1);
    });
});

describe.skip("Message Deduplication for Materialized Views", () => {
    const STREAM_1 = `mv-${Date.now()}`;
    const STREAM_2 = `mv-${Date.now() + 1}`;

    const TEST_DATA: MessageRef[] = [
        msg(STREAM_1, 1),
        msg(STREAM_1, 2),
        msg(STREAM_1, 3),
        msg(STREAM_2, 1),
        msg(STREAM_1, 2), // a dupe
        msg(STREAM_2, 2),
    ];

    it("handles each message exactly once", async () => {
        for (let i = 0; i < 2; i++) {
            await Application.create()
                .input()
                .add(new StaticInputSource(TEST_DATA))
                .dedupe(cosmosDeduper(COSMOS_CONFIG))
                .done()
                .state(Materialized.cosmosState(COSMOS_CONFIG, State))
                .dispatch({
                    async onInputMessage(msg: InputMessage, ctx: IDispatchContext) {
                        const key = ctx.metadata<string>(EventSourcedMetadata.Stream);
                        const stateRef = await ctx.state.get(key);
                        ctx.store(State, stateRef, new State({ value: msg.value }));
                    },
                })
                .output()
                .stored(Materialized.cosmosSink(COSMOS_CONFIG))
                .done()
                .run();
        }

        const client = new CosmosClient(COSMOS_CONFIG);
        const data = await client.query(undefined, {
            query: "SELECT * FROM c WHERE c.stream_id=@s1 OR c.stream_id=@s2",
            parameters: [
                { name: "@s1", value: STREAM_1 },
                { name: "@s2", value: STREAM_2 },
            ],
        });

        expect(data).toMatchObject([
            {
                stream_id: STREAM_1,
                data: {
                    value: `hello ${STREAM_1}@3`,
                },
            },
            {
                stream_id: STREAM_2,
                data: {
                    value: `hello ${STREAM_2}@2`,
                },
            },
        ]);
    });
});

describe.skip("Message Deduplication for Event Sourcing", () => {
    const STREAM_1 = `es-${Date.now()}`;
    const STREAM_2 = `es-${Date.now() + 1}`;

    const TEST_DATA: MessageRef[] = [
        msg(STREAM_1, 1),
        msg(STREAM_1, 2),
        msg(STREAM_1, 3),
        msg(STREAM_2, 1),
        msg(STREAM_1, 2), // a dupe
        msg(STREAM_2, 2),
    ];

    it("handles each message exactly once", async () => {
        for (let i = 0; i < 2; i++) {
            await Application.create()
                .input()
                .add(new StaticInputSource(TEST_DATA))
                .dedupe(cosmosDeduper(COSMOS_CONFIG))
                .done()
                .state(EventSourced.cosmosState(COSMOS_CONFIG, State, {}))
                .dispatch({
                    async onInputMessage(msg: InputMessage, ctx: IDispatchContext) {
                        const key = ctx.metadata<string>(EventSourcedMetadata.Stream);
                        const stateRef = await ctx.state.get(key);
                        ctx.store(State, stateRef, msg);
                    },
                })
                .output()
                .stored(EventSourced.cosmosSink(COSMOS_CONFIG))
                .done()
                .run();
        }

        const client = new CosmosClient(COSMOS_CONFIG);
        const data = await client.query(undefined, {
            query: "SELECT * FROM c WHERE c.stream_id=@s1 OR c.stream_id=@s2",
            parameters: [
                { name: "@s1", value: STREAM_1 },
                { name: "@s2", value: STREAM_2 },
            ],
        });

        expect(data.length).toBe(TEST_DATA.length - 1);
    });
});
