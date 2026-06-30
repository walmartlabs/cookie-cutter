/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { createRedisClient, createRedisClusterClient, createInvaildRedisClient } from "./utils";
import { SpanContext } from "opentracing";
import { DefaultComponentContext } from "@walmartlabs/cookie-cutter-core";

class TestClass {
    constructor(public text: string) {}
}

describe("RedisClient", () => {
    it("returns undefined when retrieving a key that does not exist", async () => {
        const client = createRedisClient();
        await client.initialize(DefaultComponentContext);
        try {
            const obj = await client.getObject(new SpanContext(), Uint8Array, "does-not-exist");
            expect(obj).toBeUndefined();
        } finally {
            await client.dispose();
        }
    });

    it("stores and retrieves and object by key", async () => {
        const client = createRedisClient();
        await client.initialize(DefaultComponentContext);
        try {
            const expected = new TestClass("foo bar");
            await client.putObject(new SpanContext(), TestClass, expected, "key-1");
            const actual = await client.getObject(new SpanContext(), TestClass, "key-1");
            expect(actual).toMatchObject(expected);
        } finally {
            await client.dispose();
        }
    });
});

// RedisClusterClient tests require a real multi-node Redis Cluster (minimum 3 masters).
// A standalone Redis container returns "ERR This instance has cluster support disabled"
// for cluster commands, so these are skipped in the integration suite.
describe.skip("RedisClusterClient", () => {
    it("returns undefined when retrieving a key that does not exist", async () => {
        const client = createRedisClusterClient();
        await client.initialize(DefaultComponentContext);
        try {
            const obj = await client.getObject(new SpanContext(), Uint8Array, "does-not-exist");
            expect(obj).toBeUndefined();
        } finally {
            await client.dispose();
        }
    });

    it("stores and retrieves and object by key", async () => {
        const client = createRedisClusterClient();
        await client.initialize(DefaultComponentContext);
        try {
            const expected = new TestClass("foo bar");
            await client.putObject(new SpanContext(), TestClass, expected, "key-1");
            const actual = await client.getObject(new SpanContext(), TestClass, "key-1");
            expect(actual).toMatchObject(expected);
        } finally {
            await client.dispose();
        }
    });

    it("throws an error if neither clusterHostUrls nor host is provided", () => {
        expect(() => createInvaildRedisClient()).toThrow(
            "Invalid Redis configuration: either hostUrls or host and port must be provided."
        );
    });
});
