import {
    DefaultComponentContext,
    IMessage,
    JsonMessageEncoder,
    Lifecycle,
    makeLifecycle,
    ObjectNameMessageTypeMapper,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";

import { IRedisClient, IRedisOptions, redisClient } from "../index";

class TestClass {
    constructor(public contents: string) {}
}

describe("redis integration test", () => {
    const config: IRedisOptions = {
        host: "localhost",
        port: 6379,
        db: 0,
        encoder: new JsonMessageEncoder(),
        typeMapper: new ObjectNameMessageTypeMapper(),
    };
    let client: Lifecycle<IRedisClient>;

    beforeAll(async () => {
        client = makeLifecycle(redisClient(config));
        await client.initialize(DefaultComponentContext);
    });

    afterAll(async () => {
        await client.dispose();
    });

    it("does not get a value for an non-existing key", async () => {
        const aKey = "key1";
        expect(await client.getObject(new SpanContext(), Uint8Array, aKey)).toBeUndefined();
    });
    it("successfully sets and gets a value for a given key", async () => {
        const span = new SpanContext();
        const aKey = "key2";
        const msg: IMessage = {
            type: TestClass.name,
            payload: new TestClass("test contents"),
        };
        expect(await client.putObject(span, TestClass, msg.payload, aKey)).toBeUndefined();
        const outputPayload = await client.getObject(span, TestClass, aKey);
        expect(outputPayload).toMatchObject(msg.payload);
    });
});
