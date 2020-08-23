require("wtfnode");

import {
    Application,
    StaticInputSource,
    JsonMessageEncoder,
    ObjectNameMessageTypeMapper,
    CapturingOutputSink,
    sleep,
    IPublishedMessage,
    MessageRef,
    ErrorHandlingMode,
    ConsoleLogger,
} from "@walmartlabs/cookie-cutter-core";
import {
    redisStreamSink,
    redisStreamSource,
    RedisStreamMetadata,
    IRedisInputStreamOptions,
} from "..";
import { RepublishMessageDispatcher } from "./utils";
import { dumpOpenHandles } from "@walmartlabs/cookie-cutter-core/dist/internal/helpers"

const RoundTripTestConfigurationPermutations: [string, Partial<IRedisInputStreamOptions>][] = [
    // ["base64_on", { base64Encode: true }],
    // ["base64_off", { base64Encode: false }],
    // ["batching_off", { batchSize: 1 }],
    // ["batching_on", { batchSize: 10 }],
    ["reclaim_on", { reclaimMessageInterval: 500, idleTimeout: 1500 }],
    // ["reclaim_off", { reclaimMessageInterval: null, idleTimeout: 100 }],
    // ["blocking_low", { blockTimeout: 10 }],
    // ["blocking_high", { blockTimeout: 500 }],
    // ["with_consumer_id", { consumerId: "consumer-1234" }],
    // ["default", {}],
];

const RedeliveryTestConfigurationPermutations: [string, Partial<IRedisInputStreamOptions>][] = [
    // ["dynamic_consumer_id", { reclaimMessageInterval: 50, idleTimeout: 100 }],
    // [
    //     "static_consumer_id",
    //     { consumerId: "consumer-123", reclaimMessageInterval: null, idleTimeout: 100 },
    // ],
];

describe("Redis Streams", () => {
    beforeAll(() => {
        jest.setTimeout(30000);
        jest.useFakeTimers();
    });

    for (const [id, cfg] of RoundTripTestConfigurationPermutations) {
        it(`produces and consumes messages - ${id}`, async () => {
            const input: MessageRef[] = [];
            for (let i = 0; i < 25; i++) {
                input.push(
                    ...[
                        new MessageRef(
                            { [RedisStreamMetadata.Stream]: `roundtrip-test-1-${id}` },
                            {
                                type: "type-1",
                                payload: { foo: "bar-" + i },
                            }
                        ),
                        new MessageRef(
                            { [RedisStreamMetadata.Stream]: `roundtrip-test-2-${id}` },
                            {
                                type: "type-2",
                                payload: { fizz: "buzz-" + i },
                            }
                        ),
                        new MessageRef(
                            {},
                            {
                                type: "type-1",
                                payload: { foo: "buzz-" + i },
                            }
                        ),
                    ]
                );
            }

            const producer = Application.create()
                .input()
                .add(new StaticInputSource(input))
                .done()
                .dispatch(new RepublishMessageDispatcher())
                .output()
                .published(
                    redisStreamSink({
                        host: "localhost",
                        encoder: new JsonMessageEncoder(),
                        stream: `roundtrip-test-1-${id}`,
                        typeMapper: new ObjectNameMessageTypeMapper(),
                        ...cfg,
                    })
                )
                .done()
                .run();

            const captured: IPublishedMessage[] = [];
            const consumer = Application.create()
                .input()
                .add(
                    redisStreamSource({
                        consumerGroup: `roundtrip-test-group-${id}`,
                        encoder: new JsonMessageEncoder(),
                        host: "localhost",
                        streams: [`roundtrip-test-1-${id}`, `roundtrip-test-2-${id}`],
                        typeMapper: new ObjectNameMessageTypeMapper(),

                        // important for unit test, as consumer might not be
                        // ready to receive before producer starts sending messages
                        consumerGroupStartId: "0",

                        ...cfg,
                    })
                )
                .done()
                .dispatch(new RepublishMessageDispatcher())
                .output()
                .published(new CapturingOutputSink(captured))
                .done()
                .run();

            await producer;
            console.log("producer done");
            while (captured.length !== input.length) {
                await sleep(500);
                console.log("got", captured.length);
            }

            console.log("cancelling consumer");
            consumer.cancel();
            await consumer;
            console.log("consumer done");

            // split into streams as ordering is only guaranteed within the same stream
            // ... all messages that have a field `fizz` are sent to stream2
            // ... all messages with field `foo` are sent to stream1
            const expectedStream1 = input
                .filter((m) => m.payload.payload.foo)
                .map((s) => s.payload);
            const expectedStream2 = input
                .filter((m) => m.payload.payload.fizz)
                .map((s) => s.payload);
            const actualStream1 = captured
                .filter((m) => m.message.payload.foo)
                .map((s) => s.message);
            const actualStream2 = captured
                .filter((m) => m.message.payload.fizz)
                .map((s) => s.message);

            expect(actualStream1).toMatchObject(expectedStream1);
            expect(actualStream2).toMatchObject(expectedStream2);
            console.log("test done");
            await sleep(5000);
            dumpOpenHandles(new ConsoleLogger());
        });
    }

    for (const [id, cfg] of RedeliveryTestConfigurationPermutations) {
        it(`failed messages are not acked and reprocessed - ${id}`, async () => {
            const input = [
                new MessageRef(
                    {},
                    {
                        type: "type-1",
                        payload: { foo: "bar" },
                    }
                ),
                new MessageRef(
                    {},
                    {
                        type: "type-1",
                        payload: { foo: "bar" },
                    }
                ),
            ];

            // Step 1) publish some messages
            await Application.create()
                .input()
                .add(new StaticInputSource(input))
                .done()
                .dispatch(new RepublishMessageDispatcher())
                .output()
                .published(
                    redisStreamSink({
                        host: "localhost",
                        encoder: new JsonMessageEncoder(),
                        stream: `failed-ack-test-${id}`,
                        typeMapper: new ObjectNameMessageTypeMapper(),
                    })
                )
                .done()
                .run();

            // Step 2) receive messages, but fail processing all of them
            let errors = 0;
            let consumer = Application.create()
                .input()
                .add(
                    redisStreamSource({
                        consumerGroup: `failed-ack-group-${id}`,
                        encoder: new JsonMessageEncoder(),
                        host: "localhost",
                        streams: [`failed-ack-test-${id}`],
                        typeMapper: new ObjectNameMessageTypeMapper(),

                        // important for unit test, as consumer might not be
                        // ready to receive before producer starts sending messages
                        consumerGroupStartId: "0",

                        ...cfg,
                    })
                )
                .done()
                .dispatch({
                    canDispatch: () => {
                        return true;
                    },
                    dispatch: async () => {
                        errors++;
                        throw new Error("block processing");
                    },
                })
                .run(ErrorHandlingMode.LogAndContinue);

            while (errors === 0) {
                await sleep(50);
            }

            consumer.cancel();
            await consumer;

            // Step 3) start a new consumer, it should receive the same messages again
            const captured: IPublishedMessage[] = [];
            consumer = Application.create()
                .input()
                .add(
                    redisStreamSource({
                        consumerGroup: `failed-ack-group-${id}`,
                        encoder: new JsonMessageEncoder(),
                        host: "localhost",
                        streams: [`failed-ack-test-${id}`],
                        typeMapper: new ObjectNameMessageTypeMapper(),

                        // important for unit test, as consumer might not be
                        // ready to receive before producer starts sending messages
                        consumerGroupStartId: "0",

                        ...cfg,
                    })
                )
                .done()
                .dispatch(new RepublishMessageDispatcher())
                .output()
                .published(new CapturingOutputSink(captured))
                .done()
                .run();

            while (captured.length !== input.length) {
                await sleep(50);
            }

            consumer.cancel();
            await consumer;

            const actual = captured.map((m) => m.message);
            const expected = input.map((m) => m.payload);
            expect(actual).toMatchObject(expected);
        });
    }
});
