/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    CancelablePromise,
    ConsoleLogger,
    ErrorHandlingMode,
    EventSourcedMetadata,
    IDispatchContext,
    IMessage,
    JsonMessageEncoder,
    MessageRef,
    config,
    sleep,
    StaticInputSource,
    StaticInputSourceType,
    waitForPendingIO,
    DefaultComponentContext,
    IInputSourceContext,
} from "@walmartlabs/cookie-cutter-core";
import * as ip from "ip";
import * as kafkajs from "kafkajs";
import * as ot from "opentracing";
import {
    DefaultKafkaHeaderNames,
    IKafkaBrokerConfiguration,
    IKafkaClientConfiguration,
    IKafkaSubscriptionConfiguration,
    KafkaMetadata,
    kafkaSink,
    kafkaSource,
} from "..";
import { KafkaSubscriptionConfiguration } from "../config";
import { KafkaSource } from "../KafkaSource";
const { CompressionTypes, CompressionCodecs } = require("kafkajs");
const SnappyCodec = require("kafkajs-snappy");

CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

ot.initGlobalTracer(new ot.MockTracer()); // Necessary for trace header to work

// We're a little lax on the timeout here as Jest's default timeout for
// tests are too short and we're given no guarantees on how quickly we'll
// be able to disconnect from kafka
jest.setTimeout(60000); // 60 second

class ShoppingCartCreated {
    constructor(public shoppingCartId: string) {}
}

class ShoppingCartClosed {
    constructor(public shoppingCartId: string) {}
}

class DummyState<T> {
    public value: T;
    constructor(snap?: { value: T }) {
        if (snap) {
            this.value = snap.value;
        }
    }
    public snap(): any {
        return { value: this.value };
    }
}

function generateBrokerAddr(): string {
    const host = process.env.HOST_IP || ip.address();
    if (!host) {
        throw new Error("HOST_IP env is incorrectly set");
    }
    return `${host}:30001`;
}

function producer(
    handler: any,
    inputs: StaticInputSourceType<IMessage | MessageRef>,
    retryMode: ErrorHandlingMode,
    topic?: string
): CancelablePromise<void> {
    const broker = generateBrokerAddr();

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new StaticInputSource(inputs))
        .done()
        .output()
        .published(
            kafkaSink({
                broker,
                encoder: new JsonMessageEncoder(),
                defaultTopic: topic,
            })
        )
        .done()
        .dispatch(handler)
        .run(retryMode);
}

function consumer(
    handler: any,
    testTopic: string,
    testGroup: string,
    retryMode: ErrorHandlingMode,
    commitInterval?: number
): CancelablePromise<void> {
    const broker = generateBrokerAddr();

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(
            kafkaSource({
                broker,
                encoder: new JsonMessageEncoder(),
                group: testGroup,
                topics: testTopic,
                offsetCommitInterval: commitInterval,
            })
        )
        .done()
        .dispatch(handler)
        .run(retryMode);
}

function consumerWithHeaders(
    handler: any,
    testTopic: string,
    testGroup: string,
    retryMode: ErrorHandlingMode,
    kafkaSourceConfig: any,
    commitInterval?: number
): CancelablePromise<void> {
    const broker = generateBrokerAddr();

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(
            kafkaSource({
                ...kafkaSourceConfig,
                broker,
                encoder: new JsonMessageEncoder(),
                group: testGroup,
                topics: testTopic,
                offsetCommitInterval: commitInterval,
            })
        )
        .done()
        .dispatch(handler)
        .run(retryMode);
}

describe("Kafka Integration Tests", () => {
    describe("KafkaSink and KafkaSource on an existing topic", () => {
        const producerShutdownTopic = `produce-shutdown-topic-${new Date().getTime()}`;
        const produceConsumerTopic = `produce-consume-topic-${new Date().getTime()}`;
        const assignMetadataTopic = `assignment-metadata-test-${new Date().getTime()}`;
        const multiplePartitionsTopic = `multiple-partitions-${new Date().getTime()}`;
        let admin;
        beforeAll(async () => {
            const client = new kafkajs.Kafka({
                clientId: "admin",
                brokers: [generateBrokerAddr()],
            });
            admin = client.admin();
            await admin.connect();
            await admin.createTopics({
                waitForLeaders: true,
                topics: [
                    { topic: producerShutdownTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: produceConsumerTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: assignMetadataTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: multiplePartitionsTopic, numPartitions: 3, replicationFactor: 1 },
                ],
            });
        });
        afterAll(async () => {
            await admin.disconnect();
        });
        it("produces messages and shuts down cleanly", async () => {
            const inputPayload = { value: "foo" };
            const input = [{ type: DummyState.name, payload: inputPayload }];
            const appProducer = producer(
                {
                    onDummyState: async (
                        request: DummyState<string>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value },
                            {
                                [KafkaMetadata.Topic]: producerShutdownTopic,
                                [KafkaMetadata.Key]: request.value,
                            }
                        );
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value },
                            {
                                [KafkaMetadata.Topic]: producerShutdownTopic,
                                [KafkaMetadata.Key]: request.value,
                            }
                        );
                    },
                },
                input,
                ErrorHandlingMode.LogAndContinue
            );

            await appProducer;
        });

        it("produces and consumes from a topic with various types of events. messages include traces. consumer shutdowns cleanly.", async () => {
            const groupId = "produce-consume-topic";
            const inputPayload = { value: "foo" };
            const input = [{ type: DummyState.name, payload: inputPayload }];

            const expNumConsumedMsgs = 2; // Tombstones and messages of type CustomerJourneyCompleted are skipped
            const appProducer = producer(
                {
                    onDummyState: async (
                        request: DummyState<string>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        expCartIds = [request.value + 1, request.value + 2];
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: expCartIds[0] },
                            {
                                [KafkaMetadata.Topic]: produceConsumerTopic,
                                [KafkaMetadata.Key]: expCartIds[0],
                            }
                        );
                        ctx.publish(ShoppingCartCreated, null, {
                            [KafkaMetadata.Topic]: produceConsumerTopic,
                            [KafkaMetadata.Key]: expCartIds[0],
                            [KafkaMetadata.Tombstone]: true,
                        });
                        ctx.publish(
                            ShoppingCartClosed,
                            { shoppingCartId: expCartIds[0] },
                            {
                                [KafkaMetadata.Topic]: produceConsumerTopic,
                                [KafkaMetadata.Key]: expCartIds[0],
                            }
                        );
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: expCartIds[1] },
                            {
                                [KafkaMetadata.Topic]: produceConsumerTopic,
                                [KafkaMetadata.Key]: expCartIds[1],
                            }
                        );
                        ctx.publish(ShoppingCartCreated, null, {
                            [KafkaMetadata.Topic]: produceConsumerTopic,
                            [KafkaMetadata.Key]: expCartIds[1],
                            [KafkaMetadata.Tombstone]: true,
                        });
                    },
                },
                input,
                ErrorHandlingMode.LogAndContinue
            );

            let expCartIds = [];
            const receivedKafkaMsg = [];
            const receivedKafkaKeys = [];
            const traceHeaders = [];
            const appConsumer = consumer(
                {
                    onShoppingCartCreated: async (
                        msg: ShoppingCartCreated,
                        _: IDispatchContext
                    ): Promise<void> => {
                        receivedKafkaMsg.push(msg.shoppingCartId);
                        receivedKafkaKeys.push(_.metadata(KafkaMetadata.Key));
                    },
                },
                produceConsumerTopic,
                groupId,
                ErrorHandlingMode.LogAndContinue
            );

            try {
                await appProducer;

                const checkKafkaPromise = new Promise<void>(async (resolve) => {
                    while (receivedKafkaMsg.length < expNumConsumedMsgs) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer.cancel();
                    resolve();
                });
                await checkKafkaPromise;
                await appConsumer;
            } finally {
                // check that we received expected msgs
                expect(receivedKafkaMsg).toEqual(expect.arrayContaining(expCartIds));
                expect(receivedKafkaKeys).toEqual(expect.arrayContaining(expCartIds));
                expect(receivedKafkaMsg.length).toBeLessThanOrEqual(expNumConsumedMsgs);
                for (const trace of traceHeaders) {
                    expect(trace).toEqual({
                        "x-instana-l": expect.any(String),
                        "x-instana-s": expect.any(String),
                        "x-instana-t": expect.any(String),
                    });
                }
                // check offsets were committed correctly
                const topics = await admin.fetchOffsets({
                    groupId,
                    topics: [produceConsumerTopic],
                });
                expect(topics[0].partitions).toMatchObject([{ partition: 0, offset: "5" }]);
            }
        });

        it("produces and consumes from a topic with messages containing different key assignments based on input metadata", async () => {
            const groupId = "assignment-metadata-test";
            const testKeyOne = "KAFKAJS_ONE";
            const testKeyTwo = "KAFKAJS_TWO";
            const streamId = "10101";
            const values = [
                "key_and_stream_id_provided",
                "key_provided",
                "stream_id_provided",
                "nothing_provided",
            ];
            const metas = [
                {
                    [KafkaMetadata.Topic]: assignMetadataTopic,
                    [KafkaMetadata.Key]: testKeyOne,
                    [EventSourcedMetadata.Stream]: streamId,
                },
                {
                    [KafkaMetadata.Topic]: assignMetadataTopic,
                    [KafkaMetadata.Key]: testKeyTwo,
                },
                {
                    [KafkaMetadata.Topic]: assignMetadataTopic,
                    [EventSourcedMetadata.Stream]: streamId,
                },
                {
                    [KafkaMetadata.Topic]: assignMetadataTopic,
                },
            ];
            const input = [
                new MessageRef(metas[0], {
                    type: DummyState.name,
                    payload: { value: { value: values[0], metadata: metas[0] } },
                }),
                new MessageRef(metas[1], {
                    type: DummyState.name,
                    payload: { value: { value: values[1], metadata: metas[1] } },
                }),
                new MessageRef(metas[2], {
                    type: DummyState.name,
                    payload: { value: { value: values[2], metadata: metas[2] } },
                }),
                new MessageRef(metas[3], {
                    type: DummyState.name,
                    payload: { value: { value: values[3], metadata: metas[3] } },
                }),
            ];

            const appProducer = producer(
                {
                    onDummyState: async (
                        request: DummyState<{ value: string; metadata: any }>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value.value },
                            request.value.metadata
                        );
                    },
                },
                input,
                ErrorHandlingMode.LogAndContinue
            );

            const keys: any[] = [];
            const receivedKafkaMessages: ShoppingCartCreated[] = [];
            const appConsumer = consumer(
                {
                    onShoppingCartCreated: async (
                        msg: ShoppingCartCreated,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        keys.push(ctx.metadata(KafkaMetadata.Key));
                        receivedKafkaMessages.push(msg);
                    },
                },
                assignMetadataTopic,
                groupId,
                ErrorHandlingMode.LogAndContinue
            );

            try {
                await appProducer;

                const checkKafkaPromise = new Promise<void>(async (resolve) => {
                    while (receivedKafkaMessages.length < input.length) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer.cancel();
                    resolve();
                });
                await checkKafkaPromise;
                await appConsumer;
            } finally {
                expect(receivedKafkaMessages.length).toBe(input.length);
                expect(keys).toEqual(
                    expect.arrayContaining([testKeyOne, testKeyTwo, streamId, null])
                );
                const topics = await admin.fetchOffsets({
                    groupId,
                    topics: [assignMetadataTopic],
                });
                expect(topics[0].partitions).toMatchObject([{ partition: 0, offset: "4" }]);
            }
        });

        it("publishes msgs to different partitions (number and string values) and consumes them successfully", async () => {
            const consumerGroupId = "multiple-partitions";
            const inputPayload = { value: "foo" };
            const input = [{ type: DummyState.name, payload: inputPayload }];

            const expNumConsumedMsgs = 9;
            const appProducer = producer(
                {
                    onDummyState: async (
                        request: DummyState<string>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        for (let i = 0; i < 3; i++) {
                            const key = request.value + 1;
                            // Partition key "foo" goes with partition 0 with a setup of 3 partitions if we use createPartitioner
                            ctx.publish(
                                ShoppingCartCreated,
                                { shoppingCartId: request.value + i },
                                { [KafkaMetadata.Partition]: "foo", [KafkaMetadata.Key]: key }
                            );
                            ctx.publish(
                                ShoppingCartCreated,
                                { shoppingCartId: request.value + i },
                                { [KafkaMetadata.Partition]: 1, [KafkaMetadata.Key]: key }
                            );
                            ctx.publish(
                                ShoppingCartCreated,
                                { shoppingCartId: request.value + i },
                                { [KafkaMetadata.Partition]: 2, [KafkaMetadata.Key]: key }
                            );
                        }
                    },
                },
                input,
                ErrorHandlingMode.LogAndContinue,
                multiplePartitionsTopic
            );

            const partitions: any[] = [];
            const receivedKafkaMessages: ShoppingCartCreated[] = [];
            const appConsumer = consumer(
                {
                    onShoppingCartCreated: async (
                        msg: ShoppingCartCreated,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        partitions.push(ctx.metadata(KafkaMetadata.Partition));
                        receivedKafkaMessages.push(msg);
                    },
                },
                multiplePartitionsTopic,
                consumerGroupId,
                ErrorHandlingMode.LogAndContinue
            );

            try {
                await appProducer;

                const checkKafkaPromise = new Promise<void>(async (resolve) => {
                    while (receivedKafkaMessages.length < expNumConsumedMsgs) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer.cancel();
                    resolve();
                });
                await checkKafkaPromise;
                await appConsumer;
            } finally {
                expect(receivedKafkaMessages.length).toBeLessThanOrEqual(expNumConsumedMsgs);
                expect(partitions).toEqual(expect.arrayContaining([0, 0, 0, 1, 1, 1, 2, 2, 2]));
                const topics = await admin.fetchOffsets({
                    groupId: consumerGroupId,
                    topics: [multiplePartitionsTopic],
                });
                expect(topics[0].partitions).toMatchObject([
                    { partition: 0, offset: "3" },
                    { partition: 1, offset: "3" },
                    { partition: 2, offset: "3" },
                ]);
            }
        });
    });

    describe("KafkaSource for multiple types of topics", () => {
        const testTopicNormal = `no-seek-${new Date().getTime()}`;
        const testTopicCompacted = `compacted-${new Date().getTime()}`;
        let admin: any;
        beforeAll(async () => {
            const client = new kafkajs.Kafka({
                clientId: "admin",
                brokers: [generateBrokerAddr()],
            });
            admin = client.admin();
            await admin.connect();
            await admin.createTopics({
                waitForLeaders: true,
                topics: [
                    { topic: testTopicNormal, numPartitions: 1, replicationFactor: 1 },
                    { topic: testTopicCompacted, numPartitions: 1, replicationFactor: 1 },
                ],
            });
        });
        afterAll(async () => {
            await admin.disconnect();
        });

        // We should be able to start a consumer and read from two different topics (normal and compacted)
        // and then subsequently close and restart the same consumer where we only re-consume from the beginning
        // of the compacted topic
        it("consumes from a normal and compacted topic, stops, and consumes again from the beginning of only the compacted topic", async () => {
            const consumerGroupId = "kafka-compacted";
            const expPayload = { value: "foo" };
            const input = [{ type: DummyState.name, payload: expPayload }];

            const topicList = `${testTopicCompacted}|compacted,${testTopicNormal}`;
            const appProducer = producer(
                {
                    onDummyState: async (
                        _: DummyState<string>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        for (const { shoppingCartId } of [
                            { shoppingCartId: "1" },
                            { shoppingCartId: "2" },
                        ]) {
                            ctx.publish(
                                ShoppingCartCreated,
                                { shoppingCartId },
                                {
                                    [KafkaMetadata.Key]: shoppingCartId,
                                    [KafkaMetadata.Topic]: testTopicNormal,
                                    [KafkaMetadata.Partition]: 0,
                                }
                            );
                            ctx.publish(
                                ShoppingCartCreated,
                                { shoppingCartId },
                                {
                                    [KafkaMetadata.Key]: shoppingCartId,
                                    [KafkaMetadata.Topic]: testTopicCompacted,
                                    [KafkaMetadata.Partition]: 0,
                                }
                            );
                        }
                    },
                },
                input,
                ErrorHandlingMode.LogAndContinue
            );

            const expNumMsgsFirstConsumer = 4;
            const expNumMsgsSecondConsumer = 2;
            let processedMsgs = 0;
            const createAppConsumerFn = () => {
                return consumer(
                    {
                        onShoppingCartCreated: async (
                            _: ShoppingCartCreated,
                            __: IDispatchContext
                        ): Promise<void> => {
                            processedMsgs += 1;
                        },
                    },
                    topicList,
                    consumerGroupId,
                    ErrorHandlingMode.LogAndRetry
                );
            };

            let firstConsumer;
            let secondConsumer;
            try {
                await appProducer;

                firstConsumer = createAppConsumerFn();
                const checkFirstConsumerPromise = new Promise<void>(async (resolve) => {
                    while (processedMsgs < expNumMsgsFirstConsumer) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    firstConsumer.cancel();
                    resolve();
                });
                await checkFirstConsumerPromise;
                await firstConsumer;

                secondConsumer = createAppConsumerFn();
                // restart of the consumer should only consume 2 more messages
                const checkSecondConsumerPromise = new Promise<void>(async (resolve) => {
                    while (processedMsgs < expNumMsgsFirstConsumer + expNumMsgsSecondConsumer) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    secondConsumer.cancel();
                    resolve();
                });
                await checkSecondConsumerPromise;
                await secondConsumer;
            } finally {
                expect(processedMsgs).toBe(expNumMsgsFirstConsumer + expNumMsgsSecondConsumer);
                const testTopics = await admin.fetchOffsets({
                    groupId: consumerGroupId,
                    topics: [testTopicNormal],
                });
                expect(testTopics[0].partitions).toMatchObject([{ partition: 0, offset: "2" }]);
                const testTopicsCompacted = await admin.fetchOffsets({
                    groupId: consumerGroupId,
                    topics: [testTopicCompacted],
                });
                expect(testTopicsCompacted[0].partitions).toMatchObject([
                    { partition: 0, offset: "2" },
                ]);
            }
        });
    });

    describe("Multiple consumers for an existing topic using KafkaSource", () => {
        const testTopic = `two-consumers-integration-test-${new Date().getTime()}`;
        beforeAll(async () => {
            const client = new kafkajs.Kafka({
                clientId: "admin",
                brokers: [generateBrokerAddr()],
            });
            const admin = client.admin();
            try {
                await admin.connect();
                await admin.createTopics({
                    waitForLeaders: true,
                    topics: [{ topic: testTopic, numPartitions: 2, replicationFactor: 1 }],
                });
            } finally {
                await admin.disconnect();
            }
        });
        it("triggers a rebalance after staggering the joining of a second consumer.", async () => {
            // appConsumer1 will receive a batch of messages for a single partition
            // and waits a little before completing processing of the msgs.
            // while it waits, we simulate a app2 joining and re-balancing the partitions.
            // in the case where appConsumer1's partition was reassigned to app2 in the middle of processing
            // then we expect msgs to have been re-processed potentially. This can happen a varied number of times
            // and is hard to simulate due to kafkajs polling but we can say that at least 2 messages will get processed twice.
            const groupId = "two-consumers";
            const expPayload = { value: "foo" };
            const input = [{ type: DummyState.name, payload: expPayload }];

            const appProducer = producer(
                {
                    onDummyState: async (
                        request: DummyState<string>,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value + 1 },
                            { [KafkaMetadata.Partition]: 0 }
                        );
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value + 2 },
                            { [KafkaMetadata.Partition]: 0 }
                        );
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value + 3 },
                            { [KafkaMetadata.Partition]: 1 }
                        );
                        ctx.publish(
                            ShoppingCartCreated,
                            { shoppingCartId: request.value + 4 },
                            { [KafkaMetadata.Partition]: 1 }
                        );
                    },
                },
                input,
                ErrorHandlingMode.LogAndRetry,
                testTopic
            );

            let totalProcessedMsgs = 0;
            const expMinimumTotalProcessedMsgs = 5;
            let secondAppProcessedMsgs = 0;
            let createSecondConsumer = false;
            let appConsumer2;

            try {
                await appProducer;

                const appConsumer1 = consumer(
                    {
                        onShoppingCartCreated: async (
                            _: ShoppingCartCreated,
                            __: IDispatchContext
                        ): Promise<void> => {
                            totalProcessedMsgs += 1;
                            createSecondConsumer = true;
                            // wait a bit here to allow appConsumer2 to join after getting the first msg
                            if (totalProcessedMsgs === 1) {
                                await sleep(5000);
                            }
                        },
                    },
                    testTopic,
                    groupId,
                    ErrorHandlingMode.LogAndContinue,
                    1000
                );

                const createAppConsumer2Promise = new Promise(
                    async (resolve): Promise<CancelablePromise<void>> => {
                        while (!createSecondConsumer) {
                            await sleep(100);
                            await waitForPendingIO();
                        }
                        appConsumer2 = consumer(
                            {
                                onShoppingCartCreated: async (
                                    _: ShoppingCartCreated,
                                    __: IDispatchContext
                                ): Promise<void> => {
                                    totalProcessedMsgs += 1;
                                    secondAppProcessedMsgs += 1;
                                },
                            },
                            testTopic,
                            groupId,
                            ErrorHandlingMode.LogAndContinue,
                            1000
                        );
                        resolve(appConsumer2);
                    }
                );
                const checkAppConsumer2ReceivedMsgs = new Promise<void>(async (resolve) => {
                    while (secondAppProcessedMsgs < 2) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer2.cancel();
                    appConsumer1.cancel();
                    resolve();
                });
                await Promise.all([
                    createAppConsumer2Promise,
                    checkAppConsumer2ReceivedMsgs,
                    appConsumer1,
                    appConsumer2,
                ]);
            } finally {
                expect(totalProcessedMsgs).toBeGreaterThanOrEqual(expMinimumTotalProcessedMsgs);
                expect(secondAppProcessedMsgs).toBeLessThanOrEqual(2);
            }
        });
    });
    describe("Snappy Encoded Messages", () => {
        const snappyTopic = `snappy-topic-${new Date().getTime()}`;
        const shoppingCartIds = ["test-id-1", "test-id-2"];
        let admin;
        let producer: kafkajs.Producer;
        beforeAll(async () => {
            const client = new kafkajs.Kafka({
                clientId: "admin",
                brokers: [generateBrokerAddr()],
            });
            admin = client.admin();
            await admin.connect();
            await admin.createTopics({
                waitForLeaders: true,
                topics: [{ topic: snappyTopic, numPartitions: 1, replicationFactor: 1 }],
            });
            producer = client.producer();
            await producer.connect();
            await producer.send({
                topic: snappyTopic,
                compression: CompressionTypes.Snappy,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: { [DefaultKafkaHeaderNames.eventType]: ShoppingCartCreated.name },
                    },
                    {
                        key: "key2",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[1] }),
                        headers: { [DefaultKafkaHeaderNames.eventType]: ShoppingCartCreated.name },
                    },
                ],
            });
        });
        afterAll(async () => {
            await producer.disconnect();
            await admin.disconnect();
        });
        it("successfully consumes messages from a snappy encoded topic", async () => {
            const groupId = "snappy-topic";
            const expNumConsumedMsgs = 2;
            const receivedKafkaMsg = [];
            const appConsumer = consumer(
                {
                    onShoppingCartCreated: async (
                        msg: ShoppingCartCreated,
                        _: IDispatchContext
                    ): Promise<void> => {
                        receivedKafkaMsg.push(msg.shoppingCartId);
                    },
                },
                snappyTopic,
                groupId,
                ErrorHandlingMode.LogAndContinue
            );

            try {
                const checkKafkaPromise = new Promise<void>(async (resolve) => {
                    while (receivedKafkaMsg.length < expNumConsumedMsgs) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer.cancel();
                    resolve();
                });
                await checkKafkaPromise;
                await appConsumer;
            } finally {
                // check that we received expected msgs
                expect(receivedKafkaMsg).toEqual(expect.arrayContaining(shoppingCartIds));
                expect(receivedKafkaMsg.length).toBeLessThanOrEqual(expNumConsumedMsgs);
            }
        });
    });
    describe("Message Headers with Array Values", () => {
        type configType = IKafkaBrokerConfiguration &
            IKafkaSubscriptionConfiguration &
            IKafkaClientConfiguration;
        function parseConfig(configuration: configType): configType {
            return config.parse(KafkaSubscriptionConfiguration, configuration, {
                consumeTimeout: 50,
                offsetCommitInterval: 5000,
                eos: false,
                headerNames: DefaultKafkaHeaderNames,
                preprocessor: {
                    process: (msg) => msg,
                },
                connectionTimeout: 1000,
                requestTimeout: 30000,
            });
        }
        const MockInputSourceContext: IInputSourceContext = {
            evict: () => {
                return Promise.resolve();
            },
        };
        const sucessTopic = `headers-arrays-success-integration-test-${new Date().getTime()}`;
        const failTypeTopic = `headers-arrays-fail-type-integration-test-${new Date().getTime()}`;
        const failSnTopic = `headers-arrays-fail-sn-integration-test-${new Date().getTime()}`;
        const failStreamTopic = `headers-arrays-fail-stream-integration-test-${new Date().getTime()}`;
        const failTimestampTopic = `headers-arrays-fail-timestamp-integration-test-${new Date().getTime()}`;
        const shoppingCartIds = ["test-id-1", "test-id-2"];
        const secondMessage = {
            key: "key2",
            value: JSON.stringify({ shoppingCartId: shoppingCartIds[1] }),
            headers: { [DefaultKafkaHeaderNames.eventType]: ShoppingCartCreated.name },
        };
        const bufValue = Buffer.from("this was a buffer");
        const buffElement1 = Buffer.from("this was a buffer element 1");
        const buffElement2 = Buffer.from("this was a buffer element 2");
        const bufArray = [buffElement1, buffElement2];
        const strValue = "this was a string";
        const strElement1 = "this was a string element 1";
        const strElement2 = "this was a string element 2";
        const strArray = [strElement1, strElement2];
        let admin;
        let producer: kafkajs.Producer;
        beforeAll(async () => {
            const client = new kafkajs.Kafka({
                clientId: "admin",
                brokers: [generateBrokerAddr()],
            });
            admin = client.admin();
            await admin.connect();
            await admin.createTopics({
                waitForLeaders: true,
                topics: [
                    { topic: sucessTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: failTypeTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: failSnTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: failStreamTopic, numPartitions: 1, replicationFactor: 1 },
                    { topic: failTimestampTopic, numPartitions: 1, replicationFactor: 1 },
                ],
            });
            producer = client.producer();
            await producer.connect();
            await producer.send({
                topic: sucessTopic,
                compression: kafkajs.CompressionTypes.None,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: {
                            [DefaultKafkaHeaderNames.eventType]: [ShoppingCartCreated.name],
                            bufferHeader: bufValue,
                            bufferArrayHeader: bufArray,
                            stringHeader: strValue,
                            stringArrayHeader: strArray,
                        },
                    },
                ],
            });
            await producer.send({
                topic: failTypeTopic,
                compression: kafkajs.CompressionTypes.None,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: {
                            [DefaultKafkaHeaderNames.eventType]: [
                                ShoppingCartCreated.name,
                                "second_event_type",
                            ],
                        },
                    },
                    secondMessage,
                ],
            });
            await producer.send({
                topic: failStreamTopic,
                compression: kafkajs.CompressionTypes.None,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: {
                            [DefaultKafkaHeaderNames.eventType]: [ShoppingCartCreated.name],
                            [DefaultKafkaHeaderNames.stream]: ["first_stream", "second_stream"],
                        },
                    },
                    secondMessage,
                ],
            });
            await producer.send({
                topic: failSnTopic,
                compression: kafkajs.CompressionTypes.None,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: {
                            [DefaultKafkaHeaderNames.eventType]: [ShoppingCartCreated.name],
                            [DefaultKafkaHeaderNames.sequenceNumber]: ["101", "102"],
                        },
                    },
                    secondMessage,
                ],
            });
            await producer.send({
                topic: failTimestampTopic,
                compression: kafkajs.CompressionTypes.None,
                messages: [
                    {
                        key: "key1",
                        value: JSON.stringify({ shoppingCartId: shoppingCartIds[0] }),
                        headers: {
                            [DefaultKafkaHeaderNames.eventType]: [ShoppingCartCreated.name],
                            [DefaultKafkaHeaderNames.timestamp]: ["100000", "200000"],
                        },
                    },
                    secondMessage,
                ],
            });
        });
        afterAll(async () => {
            await producer.disconnect();
            await admin.disconnect();
        });
        it("successfully parses headers of type Buffer | string | Buffer[] | string[]", async () => {
            const groupId = "headers-topic-success";
            const expNumConsumedMsgs = 1;
            const receivedKafkaMsg = [];
            const additionalHeaders: { [key: string]: string } = {
                bufferHeader: "bufferHeader",
                bufferArrayHeader: "bufferArrayHeader",
                stringHeader: "stringHeader",
                stringArrayHeader: "stringArrayHeader",
            };
            const receivedHeaderValues: { [key: string]: string } = {};
            const appConsumer = consumerWithHeaders(
                {
                    onShoppingCartCreated: async (
                        msg: ShoppingCartCreated,
                        ctx: IDispatchContext
                    ): Promise<void> => {
                        receivedKafkaMsg.push(msg.shoppingCartId);
                        receivedHeaderValues[DefaultKafkaHeaderNames.eventType] = ctx.metadata(
                            DefaultKafkaHeaderNames.eventType
                        );
                        for (const headerName of Object.keys(additionalHeaders)) {
                            receivedHeaderValues[headerName] = ctx.metadata(headerName);
                        }
                    },
                },
                sucessTopic,
                groupId,
                ErrorHandlingMode.LogAndFail,
                {
                    additionalHeaderNames: additionalHeaders,
                }
            );

            try {
                const checkKafkaPromise = new Promise<void>(async (resolve) => {
                    while (receivedKafkaMsg.length < expNumConsumedMsgs) {
                        await sleep(1000);
                        await waitForPendingIO();
                    }
                    appConsumer.cancel();
                    resolve();
                });
                await checkKafkaPromise;
                await appConsumer;
            } finally {
                // check that we received expected msgs
                expect(receivedKafkaMsg).toEqual(expect.arrayContaining([shoppingCartIds[0]]));
                expect(receivedKafkaMsg.length).toBeLessThanOrEqual(expNumConsumedMsgs);
                expect(receivedHeaderValues).toEqual({
                    event_type: ShoppingCartCreated.name,
                    bufferHeader: bufValue.toString(),
                    bufferArrayHeader: [buffElement1.toString(), buffElement2.toString()],
                    stringHeader: strValue,
                    stringArrayHeader: strArray,
                });
            }
        });
        it(`fails on too many values for eventType (${DefaultKafkaHeaderNames.eventType})`, async () => {
            const groupId = "headers-topic-fail-type";
            const broker = generateBrokerAddr();
            let configuration: configType = {
                broker,
                encoder: new JsonMessageEncoder(),
                group: groupId,
                topics: failTypeTopic,
            };
            configuration = parseConfig(configuration);
            const source = new KafkaSource(configuration);
            const logger = new ConsoleLogger();
            const spy = jest.spyOn(logger, "error");
            await source.initialize({
                ...DefaultComponentContext,
                logger,
            });

            let error;
            try {
                await source.start(MockInputSourceContext).next();
            } catch (err) {
                error = err;
            } finally {
                await source.stop();
                await source.dispose();
            }
            expect(error).toBeUndefined();
            expect(spy).toHaveBeenNthCalledWith(
                1,
                `Header contains an array with 2 values for ${DefaultKafkaHeaderNames.eventType}, expected only 1`
            );
        });
        it(`fails on too many values for stream (${DefaultKafkaHeaderNames.stream})`, async () => {
            const groupId = "headers-topic-fail-stream";
            const broker = generateBrokerAddr();
            let configuration: configType = {
                broker,
                encoder: new JsonMessageEncoder(),
                group: groupId,
                topics: failStreamTopic,
            };
            configuration = parseConfig(configuration);
            const source = new KafkaSource(configuration);
            const logger = new ConsoleLogger();
            const spy = jest.spyOn(logger, "error");
            await source.initialize({
                ...DefaultComponentContext,
                logger,
            });

            let error;
            try {
                await source.start(MockInputSourceContext).next();
            } catch (err) {
                error = err;
            } finally {
                await source.stop();
                await source.dispose();
            }
            expect(error).toBeUndefined();
            expect(spy).toHaveBeenNthCalledWith(
                1,
                `Header contains an array with 2 values for ${DefaultKafkaHeaderNames.stream}, expected only 1`
            );
        });
        it(`fails on too many values for sequenceNumber (${DefaultKafkaHeaderNames.sequenceNumber})`, async () => {
            const groupId = "headers-topic-fail-sn";
            const broker = generateBrokerAddr();
            let configuration: configType = {
                broker,
                encoder: new JsonMessageEncoder(),
                group: groupId,
                topics: failSnTopic,
            };
            configuration = parseConfig(configuration);
            const source = new KafkaSource(configuration);
            const logger = new ConsoleLogger();
            const spy = jest.spyOn(logger, "error");
            await source.initialize({
                ...DefaultComponentContext,
                logger,
            });

            let error;
            try {
                await source.start(MockInputSourceContext).next();
            } catch (err) {
                error = err;
            } finally {
                await source.stop();
                await source.dispose();
            }
            expect(error).toBeUndefined();
            expect(spy).toHaveBeenNthCalledWith(
                1,
                `Header contains an array with 2 values for ${DefaultKafkaHeaderNames.sequenceNumber}, expected only 1`
            );
        });
        it(`fails on too many values for timestamp (${DefaultKafkaHeaderNames.timestamp})`, async () => {
            const groupId = "headers-topic-fail-timestamp";
            const broker = generateBrokerAddr();
            let configuration: configType = {
                broker,
                encoder: new JsonMessageEncoder(),
                group: groupId,
                topics: failTimestampTopic,
            };
            configuration = parseConfig(configuration);
            const source = new KafkaSource(configuration);
            const logger = new ConsoleLogger();
            const spy = jest.spyOn(logger, "error");
            await source.initialize({
                ...DefaultComponentContext,
                logger,
            });

            let error;
            try {
                await source.start(MockInputSourceContext).next();
            } catch (err) {
                error = err;
            } finally {
                await source.stop();
                await source.dispose();
            }
            expect(error).toBeUndefined();
            expect(spy).toHaveBeenNthCalledWith(
                1,
                `Header contains an array with 2 values for ${DefaultKafkaHeaderNames.timestamp}, expected only 1`
            );
        });
    });
});
