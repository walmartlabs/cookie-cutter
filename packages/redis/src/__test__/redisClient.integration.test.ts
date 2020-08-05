/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IMessage,
    JsonMessageEncoder,
    Lifecycle,
    makeLifecycle,
    ObjectNameMessageTypeMapper,
    Application,
    IDispatchContext,
    ConsoleLogger,
    ErrorHandlingMode,
    NullOutputSink,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { Callback, RedisClient } from "redis";

import {
    IRedisClient,
    redisClient,
    IRedisOutputStreamOptions,
    IRedisInputStreamOptions,
    redisStreamSource,
    RedisMetadata,
    RedisStreamMetadata,
} from "../index";
import { promisify } from "util";
import { RedisClientWithStreamOperations, RawReadGroupResult } from "../RedisProxy";
import { RedisStreamSink } from "../RedisStreamSink";

class Foo {
    constructor(public text: string) {}
}

class Bar {
    constructor(public text: string) {}
}
class TestClass {
    constructor(public contents: string) {}
}

interface RedisClientTypePatch {
    xread: (args: string[], cb: Callback<RawReadGroupResult>) => boolean;
    xinfo: (args: string[], cb: Callback<[string | number[]]>) => boolean;
}

describe("redis integration test", () => {
    const testStreamName = "test-stream";
    const getConfig = (
        readStreams?: string[]
    ): IRedisOutputStreamOptions & IRedisInputStreamOptions => ({
        host: "localhost",
        port: 6379,
        db: 0,
        encoder: new JsonMessageEncoder(),
        typeMapper: new ObjectNameMessageTypeMapper(),
        writeStream: testStreamName,
        readStreams: readStreams || [testStreamName],
        consumerGroup: "test-consumer-group",
        consumerId: "test-consumer",
        batchSize: 5,
        idleTimeout: 5000,
        blockTimeout: 5000,
        base64Encode: true,
    });

    let ccClient: Lifecycle<IRedisClient>;
    let client: RedisClientWithStreamOperations & RedisClientTypePatch;
    let asyncXRead;
    let asyncXInfo;
    let asyncFlushAll;
    let asyncQuit;

    beforeAll(async () => {
        jest.setTimeout(10000);
        ccClient = makeLifecycle(redisClient(getConfig()));
        await ccClient.initialize(DefaultComponentContext);

        client = new RedisClient(getConfig()) as RedisClientWithStreamOperations &
            RedisClientTypePatch;
        asyncXRead = promisify(client.xread).bind(client);
        asyncXInfo = promisify(client.xinfo).bind(client);
        asyncFlushAll = promisify(client.flushall).bind(client);
        asyncQuit = promisify(client.quit).bind(client);
    });

    afterEach(async () => {
        return await asyncFlushAll();
    });

    afterAll(async () => {
        await Promise.all([ccClient.dispose(), asyncQuit()]);
        // Restore timeout
        jest.setTimeout(5000);
    });

    const runSinkTest = async (streamName?: string) => {
        const inputMsg = new Foo("test");
        const app = Application.create()
            .logger(new ConsoleLogger())
            .input()
            .add(new StaticInputSource([{ type: Foo.name, payload: inputMsg }]))
            .done()
            .dispatch({
                onFoo: async (msg: Foo, ctx: IDispatchContext) => {
                    ctx.publish(Bar, new Bar(`output for ${msg.text}`), {
                        [RedisStreamMetadata.StreamName]: streamName,
                    });
                },
            })
            .output()
            .published(new RedisStreamSink(getConfig()))
            .done()
            .run(ErrorHandlingMode.LogAndContinue);

        setTimeout(() => app.cancel(), 2000);
        await app;

        const results = await asyncXRead(["streams", streamName || testStreamName, "0"]);
        expect(results).not.toBeFalsy();

        const storedValue = ((results: RawReadGroupResult): Uint8Array => {
            // [streamName, [streamValue]]
            const [, [streamValue]] = results[0];

            // [streamId, keyValues]
            const [, keyValues] = streamValue;

            // [RedisMetadata.OutputSinkStreamKey, data]
            const [, data] = keyValues;

            return new Uint8Array(Buffer.from(data, "base64"));
        })(results);

        const msg = getConfig().encoder.decode(storedValue, Bar.name);

        expect(msg.payload.text).toEqual(`output for ${inputMsg.text}`);
    };

    const runConsumerGroupTest = async (readStreams: string[]) => {
        const app = Application.create()
            .logger(new ConsoleLogger())
            .input()
            .add(redisStreamSource(getConfig(readStreams)))
            .done()
            .dispatch({})
            .run(ErrorHandlingMode.LogAndContinue);

        setTimeout(() => {
            app.cancel();
        }, 2000);

        await app;

        for (const readStream of readStreams) {
            const consumerGroups = await asyncXInfo(["groups", readStream]);
            expect(consumerGroups.length).toEqual(1);
        }
    };

    const runSourceTest = async (readStreams: string[]) => {
        const config = getConfig(readStreams);

        for (const readStream of readStreams) {
            const xGroupResult = await ccClient.xGroup(
                new SpanContext(),
                readStream,
                config.consumerGroup,
                "0",
                false
            );

            expect(xGroupResult).toEqual("OK");
        }

        for (const readStream of readStreams) {
            const streamId = await ccClient.xAddObject(
                new SpanContext(),
                Foo.name,
                readStream,
                RedisMetadata.OutputSinkStreamKey,
                new Foo("test")
            );

            expect(streamId).toBeTruthy();
        }

        let results = await ccClient.xReadGroup(
            new SpanContext(),
            config.readStreams,
            config.consumerGroup,
            config.consumerId,
            1,
            100
        );

        expect(results.length).toEqual(readStreams.length);

        const app = Application.create()
            .logger(new ConsoleLogger())
            .input()
            .add(redisStreamSource(config))
            .done()
            .dispatch({
                onFoo: async (msg: Foo, ctx: IDispatchContext) => {
                    ctx.publish(Bar, new Bar(`output for ${msg.text}`));
                },
            })
            .output()
            .published(new NullOutputSink())
            .done()
            .run(ErrorHandlingMode.LogAndContinue);

        setTimeout(() => {
            app.cancel();
        }, 2000);

        await app;

        // grab messages on consumers PEL using 0 as an ID - if there are 0 results,
        // the above Message was ACK'd + handled successfully
        results = await ccClient.xReadGroup(
            new SpanContext(),
            config.readStreams,
            config.consumerGroup,
            config.consumerId,
            1,
            100,
            config.readStreams.map(() => "0")
        );

        expect(results.length).toBe(0);
    };

    const runIdleMessagesTest = async (readStreams: string[]) => {
        const config = getConfig(readStreams);
        const cfg = { ...config, idleTimeout: 0 };

        for (const readStream of readStreams) {
            const xGroupResult = await ccClient.xGroup(
                new SpanContext(),
                readStream,
                config.consumerGroup,
                "0",
                false
            );

            expect(xGroupResult).toEqual("OK");
        }

        for (const readStream of readStreams) {
            const streamId = await ccClient.xAddObject(
                new SpanContext(),
                Foo.name,
                readStream,
                RedisMetadata.OutputSinkStreamKey,
                new Foo("test")
            );

            expect(streamId).toBeTruthy();
        }

        // This will add the above message to idle-test-consumer's PEL
        let results = await ccClient.xReadGroup(
            new SpanContext(),
            config.readStreams,
            config.consumerGroup,
            "idle-test-consumer",
            1,
            100
        );

        expect(results.length).toEqual(readStreams.length);

        const app = Application.create()
            .logger(new ConsoleLogger())
            .input()
            .add(redisStreamSource(cfg))
            .done()
            .dispatch({
                onFoo: async (msg: Foo, ctx: IDispatchContext) => {
                    ctx.publish(Bar, new Bar(`output for ${msg.text}`));
                },
            })
            .output()
            .published(new NullOutputSink())
            .done()
            .run(ErrorHandlingMode.LogAndContinue);

        setTimeout(() => {
            app.cancel();
        }, 2000);

        await app;

        // grab messages on consumers PEL using 0 as an ID - if there are 0 results,
        // the above Message was ACK'd + handled successfully
        results = await ccClient.xReadGroup(
            new SpanContext(),
            config.readStreams,
            config.consumerGroup,
            "idle-test-consumer",
            1,
            100,
            config.readStreams.map(() => "0")
        );

        expect(results.length).toBe(0);
    };

    it("does not get a value for an non-existing key", async () => {
        const aKey = "key1";
        expect(await ccClient.getObject(new SpanContext(), Uint8Array, aKey)).toBeUndefined();
    });

    it("successfully sets and gets a value for a given key", async () => {
        const span = new SpanContext();
        const aKey = "key2";
        const msg: IMessage = {
            type: TestClass.name,
            payload: new TestClass("test contents"),
        };
        expect(await ccClient.putObject(span, TestClass, msg.payload, aKey)).toBeUndefined();
        const outputPayload = await ccClient.getObject(span, TestClass, aKey);
        expect(outputPayload).toMatchObject(msg.payload);
    });

    it("RedisClient successfully xadds a value into a stream and returns the id", async () => {
        const span = new SpanContext();
        const key = "test";
        const value: IMessage = {
            type: TestClass.name,
            payload: new TestClass("test"),
        };

        const id = await ccClient.xAddObject(span, TestClass.name, testStreamName, key, value);

        expect(id).not.toBeFalsy();
    });

    it("successfully adds a value to default configured redis stream through the output sink", async () => {
        await runSinkTest();
    });

    it("successfully adds a value to a non-default configured redis stream through the output sink", async () => {
        await runSinkTest("myStream");
    });

    it("successfully creates a new consumer group for single stream", async () => {
        await runConsumerGroupTest([testStreamName]);
    });

    it("successfully creates a new consumer group for multiple streams", async () => {
        await runConsumerGroupTest(["myStream1", "myStream2"]);
    });

    it("successfully processes messages from a single stream", async () => {
        await runSourceTest([testStreamName]);
    });

    it("successfully processes messages from multiple streams", async () => {
        await runSourceTest(["myStream1", "myStream2"]);
    });

    it("successfully processes expired idle messages from the consumer group for a single stream ", async () => {
        await runIdleMessagesTest([testStreamName]);
    });

    it("successfully processes expired idle messages from the consumer group for multiple streams", async () => {
        await runIdleMessagesTest(["myStream1", "myStream2"]);
    });
});
