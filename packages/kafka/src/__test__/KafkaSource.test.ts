/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

jest.mock("../KafkaConsumer");

import {
    EventSourcedMetadata,
    IInputSourceContext,
    JsonMessageEncoder,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { DefaultKafkaHeaderNames, KafkaMetadata } from "..";
import { KafkaConsumer } from "../KafkaConsumer";
import { KafkaSource } from "../KafkaSource";
import { IRawKafkaMessage } from "../model";

class ShoppingCartCreated {
    constructor(public shoppingCartId: string) {}
}

const MockInputSourceContext: IInputSourceContext = {
    evict: () => {
        return Promise.resolve();
    },
};

describe("KafkaSource", () => {
    const topicName = "topic";
    const consumerGroupId = "consumer-group";
    const broker = "broker:9092";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("#start", () => {
        const partition = 0;
        const offset = "1";
        let encoder: JsonMessageEncoder;
        let rawMessage: IRawKafkaMessage;

        const additionalHeaders: { [key: string]: string } = {
            rawHeader: "rawHeader",
            internalHeader: "externalHeader",
        };

        beforeEach(() => {
            encoder = new JsonMessageEncoder();
            rawMessage = {
                topic: topicName,
                offset,
                partition,
                key: Buffer.from("key"),
                headers: {
                    "X-Message-Type": "application/json",
                    rawHeader: "raw header value",
                    externalHeader: "external header value",
                    ignoredHeader: "this header is ignored",
                },
                timestamp: "1554845507549",
                value: Buffer.from(encoder.encode({ type: "test", payload: { foo: "bar" } })),
            };

            (KafkaConsumer.prototype.consume as any).mockImplementationOnce(
                async function* (): AsyncIterableIterator<IRawKafkaMessage> {
                    yield rawMessage;
                }
            );
        });

        it("should yield a message with the appropriate metadata", async () => {
            const source = new KafkaSource({
                topics: [topicName],
                group: consumerGroupId,
                broker,
                encoder,
                eos: true,
                headerNames: DefaultKafkaHeaderNames,
                additionalHeaderNames: additionalHeaders,
                preprocessor: {
                    process: (msg) => msg,
                },
            });

            const messages = source.start(MockInputSourceContext);
            let received: MessageRef;

            for await (const message of messages) {
                received = message;
                await source.stop();
            }

            expect(received).toBeDefined();
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.Partition)).toEqual(rawMessage.partition);
            expect(received.metadata(KafkaMetadata.Offset)).toEqual(rawMessage.offset);
            expect(received.metadata(KafkaMetadata.Key)).toEqual(rawMessage.key.toString());
            expect(received.metadata(KafkaMetadata.Timestamp)).toEqual(
                new Date(parseInt(rawMessage.timestamp, 10))
            );
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.ExactlyOnceSemantics)).toEqual(true);
            expect(received.metadata(KafkaMetadata.ConsumerGroupId)).toEqual(consumerGroupId);
            for (const internalHeaderName of Object.keys(additionalHeaders)) {
                const rawHeaderName: string = additionalHeaders[internalHeaderName];
                expect(received.metadata(internalHeaderName)).toEqual(
                    rawMessage.headers[rawHeaderName]
                );
            }
            expect(received.metadata("ignoredHeader")).toBeUndefined();
        });

        it("should attempt to add offsets for non-transactional messages when releasing", async () => {
            const source = new KafkaSource({
                topics: [topicName],
                group: consumerGroupId,
                broker,
                encoder,
                eos: false,
                headerNames: DefaultKafkaHeaderNames,
                preprocessor: {
                    process: (msg) => msg,
                },
            });

            const messages = source.start(MockInputSourceContext);
            let received: MessageRef;

            for await (const message of messages) {
                received = message;
                await source.stop();
            }

            expect(KafkaConsumer.prototype.addOffsets).toHaveBeenCalledTimes(0);
            await received.release();
            expect(KafkaConsumer.prototype.addOffsets).toHaveBeenCalledTimes(1);
            expect(KafkaConsumer.prototype.addOffsets).toHaveBeenCalledWith({
                topics: [
                    {
                        topic: topicName,
                        partitions: [
                            {
                                partition,
                                offset,
                            },
                        ],
                    },
                ],
            });
        });

        it("should no-op for kafka consumers that enable eos", async () => {
            const source = new KafkaSource({
                topics: [topicName],
                group: consumerGroupId,
                broker,
                encoder,
                eos: true,
                headerNames: DefaultKafkaHeaderNames,
                preprocessor: {
                    process: (msg) => msg,
                },
            });

            const messages = source.start(MockInputSourceContext);
            let received: MessageRef;

            for await (const message of messages) {
                received = message;
                await source.stop();
            }

            expect(KafkaConsumer.prototype.addOffsets).toHaveBeenCalledTimes(0);
            await received.release();
            expect(KafkaConsumer.prototype.addOffsets).toHaveBeenCalledTimes(0);
        });

        it("decodes json encoded messages", async () => {
            const encoder = new JsonMessageEncoder();
            rawMessage = {
                topic: topicName,
                offset,
                partition,
                key: Buffer.from("key"),
                headers: {
                    "X-Message-Type": "application/json",
                    [EventSourcedMetadata.EventType]: ShoppingCartCreated.name,
                },
                timestamp: "1554845507549",
                value: Buffer.from(
                    encoder.encode({
                        type: ShoppingCartCreated.name,
                        payload: { shoppingCartId: "testId" },
                    })
                ),
            };

            (KafkaConsumer.prototype.consume as any).mockImplementationOnce(
                async function* (): AsyncIterableIterator<IRawKafkaMessage> {
                    yield rawMessage;
                }
            );

            const source = new KafkaSource({
                topics: [topicName],
                group: consumerGroupId,
                broker,
                encoder,
                eos: true,
                headerNames: DefaultKafkaHeaderNames,
                preprocessor: {
                    process: (msg) => msg,
                },
            });

            const messages = source.start(MockInputSourceContext);
            let received: MessageRef;

            for await (const message of messages) {
                received = message;
                await source.stop();
            }

            expect(received).toBeDefined();
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.Partition)).toEqual(rawMessage.partition);
            expect(received.metadata(KafkaMetadata.Offset)).toEqual(rawMessage.offset);
            expect(received.metadata(KafkaMetadata.Key)).toEqual(rawMessage.key.toString());
            expect(received.metadata(KafkaMetadata.Timestamp)).toEqual(
                new Date(parseInt(rawMessage.timestamp, 10))
            );
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.ExactlyOnceSemantics)).toEqual(true);
            expect(received.metadata(KafkaMetadata.ConsumerGroupId)).toEqual(consumerGroupId);
        });

        it("decodes json encoded messages with preprocessing", async () => {
            const encoder = new JsonMessageEncoder();

            const envelope = {
                headers: [
                    { key: "X-Message-Type", value: "application/x-some-envelope" },
                    { key: EventSourcedMetadata.EventType, value: ShoppingCartCreated.name },
                ],
                body: Buffer.from(
                    encoder.encode({
                        type: ShoppingCartCreated.name,
                        payload: { shoppingCartId: "testId" },
                    })
                ),
            };

            rawMessage = {
                topic: topicName,
                offset,
                partition,
                key: Buffer.from("key"),
                headers: {},
                timestamp: "1554845507549",
                value: Buffer.from(JSON.stringify(envelope)),
            };

            (KafkaConsumer.prototype.consume as any).mockImplementationOnce(
                async function* (): AsyncIterableIterator<IRawKafkaMessage> {
                    yield rawMessage;
                }
            );

            const source = new KafkaSource({
                topics: [topicName],
                group: consumerGroupId,
                broker,
                encoder,
                eos: true,
                headerNames: DefaultKafkaHeaderNames,
                preprocessor: {
                    process: (msg: IRawKafkaMessage): IRawKafkaMessage => {
                        const envelope = JSON.parse(msg.value.toString());
                        return {
                            ...msg,
                            value: Buffer.from(envelope.body),
                            headers: envelope.headers,
                        };
                    },
                },
            });

            const messages = source.start(MockInputSourceContext);
            let received: MessageRef;

            for await (const message of messages) {
                received = message;
                await source.stop();
            }

            expect(received).toBeDefined();
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.Partition)).toEqual(rawMessage.partition);
            expect(received.metadata(KafkaMetadata.Offset)).toEqual(rawMessage.offset);
            expect(received.metadata(KafkaMetadata.Key)).toEqual(rawMessage.key.toString());
            expect(received.metadata(KafkaMetadata.Timestamp)).toEqual(
                new Date(parseInt(rawMessage.timestamp, 10))
            );
            expect(received.metadata(KafkaMetadata.Topic)).toEqual(topicName);
            expect(received.metadata(KafkaMetadata.ExactlyOnceSemantics)).toEqual(true);
            expect(received.metadata(KafkaMetadata.ConsumerGroupId)).toEqual(consumerGroupId);
        });
    });
});
