/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { JsonMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { ICosmosQueryClient } from "../../..";
import { CosmosStateProvider } from "../../../materialized/internal";
import { ICosmosDocument } from "../../../utils";
import { DummyState } from "../../dummystate";

async function createProvider(
    ...result: Partial<ICosmosDocument>[]
): Promise<CosmosStateProvider<any, any>> {
    const client: ICosmosQueryClient = {
        query: jest.fn(() => Promise.resolve(result)),
    };

    const provider = new CosmosStateProvider(DummyState, client, new JsonMessageEncoder());
    return provider;
}

describe("CosmosStateProvider", () => {
    it("loads state from cosmos", async () => {
        const provider = await createProvider({
            id: "key1",
            stream_id: "key1",
            sn: 2,
            data: {
                value: "test",
            },
        });

        const state = await provider.get(undefined, "key1");
        expect(state.key).toBe("key1");
        expect(state.seqNum).toBe(2);
        expect(state.state).toMatchObject({ value: "test" });
    });

    it("returns empty state if key doesn't exist yet", async () => {
        const provider = await createProvider();
        const state = await provider.get(undefined, "key1");

        expect(state.key).toBe("key1");
        expect(state.seqNum).toBe(0);
        expect(state.state).toMatchObject(new DummyState());
    });

    it("returns empty state for deleted document with last SN", async () => {
        const provider = await createProvider({
            id: "key1",
            stream_id: "key1",
            sn: 2,
            data: undefined,
        });

        const state = await provider.get(undefined, "key1");
        expect(state.key).toBe("key1");
        expect(state.seqNum).toBe(2);
        expect(state.state).toMatchObject(new DummyState());
    });

    it("throws if multiple documents with same key exist", async () => {
        const provider = await createProvider({}, {});
        await expect(provider.get(undefined, "key1")).rejects.toThrowError();
    });
});
