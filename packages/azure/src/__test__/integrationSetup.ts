/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { CosmosClient as Client } from "@azure/cosmos";

const key = process.env.COSMOS_SECRET_KEY;
const url = "https://localhost:8081";

const client = new Client({
    endpoint: url,
    key,
});

interface CosmosConfig {
    databaseId: string;
    collectionId: string;
}
export async function setup(config: CosmosConfig[]) {
    for (const entry of config) {
        await client.databases.createIfNotExists({
            id: entry.databaseId,
        });

        const partitionKey = { kind: "Hash", paths: ["/stream_id"] };
        await client
            .database(entry.databaseId)
            .containers.createIfNotExists(
                { id: entry.collectionId, partitionKey },
                { offerThroughput: 400 }
            );
    }
}

export async function teardown(databases: string[]) {
    for (const databaseId of databases) {
        await client.database(databaseId).delete();
    }
}
