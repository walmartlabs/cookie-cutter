/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { NullMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { CosmosClient } from "../../utils";

const getAllEventsQuery: string = `SELECT * FROM root r WHERE r.stream_id=@stream_id AND r.sn >= @sn ORDER BY r.sn ASC`;
const getTopNEventsQuery: string = `SELECT TOP @max * FROM root r WHERE r.stream_id=@stream_id AND r.sn >= @sn ORDER BY r.sn ASC`;

const client = new CosmosClient({
    url: "https://carrot.documents.azure.com:443/",
    key: "",
    databaseId: "coreservices",
    collectionId: "customer-journey",
    encoder: new NullMessageEncoder(),
});

describe.skip("cosmosClient", () => {
    it("validates query returns max number of events when specifying max events", async () => {
        const result = await client.query(undefined, {
            query: getTopNEventsQuery,
            parameters: [
                { name: "@stream_id", value: "journey-88888" },
                { name: "@sn", value: 1 },
                { name: "@max", value: 3 },
            ],
        });
        expect(result).toHaveLength(3);
    });

    it("validates query returns max number of events when not specifying max events", async () => {
        const result = await client.query(undefined, {
            query: getAllEventsQuery,
            parameters: [{ name: "@stream_id", value: "journey-88888" }, { name: "@sn", value: 1 }],
        });
        expect(result).toHaveLength(708);
    });
});
