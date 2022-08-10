/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

let mockSendMessages;

jest.mock("../KafkaMessageProducer", () => {
    const { KafkaMessageProducer } = (jest as any).requireActual("../KafkaMessageProducer");
    return {
        // tslint:disable-next-line:object-literal-shorthand
        KafkaMessageProducer: function (ctx, options) {
            const producer = new KafkaMessageProducer(ctx, options);
            mockSendMessages = jest.fn((...args) => {
                return producer.sendMessages(...args);
            });
            return {
                sendMessages: mockSendMessages,
            };
        },
    };
});

import {
    DefaultComponentContext,
    iterate,
    JsonMessageEncoder,
    MessageRef,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import * as ip from "ip";
import { Consumer, Kafka } from "kafkajs";
import { KafkaMessagePublishingStrategy, KafkaMetadata, kafkaSink } from "..";
import { KafkaSink } from "../KafkaSink";
import { TRACE_HEADER } from "../model";

jest.setTimeout(60000);

describe("Kafka Integration Tests", () => {
    let topicName;
    let broker: string;
    let consumer: Consumer;
    let id: number;

    beforeEach(async () => {
        id = Date.now();
        topicName = `test-topic-${id}`;
        const host = process.env.HOST_IP || ip.address();
        broker = `${host}:30001`;

        const client = new Kafka({ clientId: "integration", brokers: [broker] });

        const admin = client.admin();

        try {
            await admin.connect();
            await admin.createTopics({
                waitForLeaders: true,
                topics: [
                    { topic: topicName, numPartitions: 4, replicationFactor: 1, configEntries: [] },
                ],
            });
        } finally {
            await admin.disconnect();
        }

        consumer = client.consumer({ groupId: `consumer-group-${id}` });
        await consumer.subscribe({ topic: topicName, fromBeginning: true });
    });

    afterEach(async () => {
        if (consumer) {
            await consumer.disconnect();
        }
        // KafkaJS does not waitForConsumer() when process.env.NODE_ENV is test, which results in a KafkaJS log after tests are done
        await sleep(1000);
    });

    describe("#kafkaSink", () => {
        it("produces messages within a transaction", async () => {
            const getMessages = (payload: object, key: string) => {
                const message = { type: "type", payload };
                const metadata = { [KafkaMetadata.Topic]: topicName, [KafkaMetadata.Key]: key };
                return [
                    {
                        message,
                        metadata,
                        original: new MessageRef(metadata, message),
                        spanContext: DefaultComponentContext.tracer.startSpan("test").context(),
                    },
                ];
            };

            const key = `sink-1-${id}`;
            const payloadToCommit = { msg: "toCommit" };
            const payloadToAbort = { msg: "toAbort" };

            const messagesToAbort = getMessages(payloadToAbort, key);
            const messagesToCommit = getMessages(payloadToCommit, key);

            const sink = kafkaSink({
                defaultTopic: topicName,
                broker,
                encoder: new JsonMessageEncoder(),
                messagePublishingStrategy: KafkaMessagePublishingStrategy.Transactional,
                transactionalId: "transactional-id",
            }) as KafkaSink;

            await sink.initialize(DefaultComponentContext);
            mockSendMessages.mockRejectedValueOnce(new Error("Foobar"));
            await expect(sink.sink(iterate(messagesToAbort))).rejects.toEqual(new Error("Foobar"));
            await sink.dispose();

            // Our mock error causes the abort to fail, leaving the transaction stuck in a weird state.
            // Need to re-initialize.
            await sink.initialize(DefaultComponentContext);
            await sink.sink(iterate(messagesToCommit));

            const consumed = [];
            await consumer.run({
                eachMessage: async ({ message }) => {
                    consumed.push({
                        key: message.key.toString(),
                        value: message.value,
                        headers: message.headers,
                    });
                },
            });

            await new Promise<void>((resolve) => {
                const i = setInterval(() => {
                    if (consumed.length >= messagesToCommit.length) {
                        clearInterval(i);
                        resolve();
                    }
                }, 50);
            });

            expect(consumed).toHaveLength(messagesToCommit.length);
            expect(consumed[0].key).toEqual(key);
            const { headers, value } = consumed[0];

            expect(JSON.parse(value.toString())).toEqual(payloadToCommit);
            expect(Object.keys(headers)).toEqual([
                "dt",
                "event_type",
                "X-Message-Type",
                TRACE_HEADER,
            ]);
            await sink.dispose();
        });
    });
});
