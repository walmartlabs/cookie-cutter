/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as fs from "fs";
import { QueueClient, IQueueMessage } from "../../utils";
import { SpanContext } from "opentracing";
import { JsonMessageEncoder, EventSourcedMetadata } from "@walmartlabs/cookie-cutter-core";

const storageAccount = process.env.AZURE_STORAGE_ACCOUNT;
const storageAccessKey = process.env.AZURE_STORAGE_ACCESS_KEY;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const queueName = "testqueue";
const encoder = new JsonMessageEncoder();
const spanContext = new SpanContext();

const client = new QueueClient({
    connectionString,
    storageAccount,
    storageAccessKey,
    queueName,
    encoder,
    createQueueIfNotExists: true,
});

jest.setTimeout(90000);

describe("Blob Client", () => {
    describe("Queue Creation", () => {
        it("creates a new queue if it does not already exist", async () => {
            const newQueueName = `queue-${Date.now()}`;

            expect.assertions(2);
            try {
                await client.queueMetadata(spanContext, newQueueName);
            } catch (error) {
                expect((error as any).statusCode).toBe(404);
            }

            const newClient = new QueueClient({
                connectionString,
                storageAccount,
                storageAccessKey,
                queueName: newQueueName,
                encoder,
                createQueueIfNotExists: true,
            });

            const payload = encoder.encode({ type: "test", payload: "content" });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };
            await newClient.write(spanContext, payload, headers);

            const result = await newClient.queueMetadata(spanContext, newQueueName);
            expect(result.approximateMessagesCount).toBe(1);
        });

        it("will not create a new queue if not configured to", async () => {
            const newQueueName = `queue-${Date.now()}`;

            expect.assertions(2);
            try {
                await client.queueMetadata(spanContext, newQueueName);
            } catch (error) {
                expect((error as any).statusCode).toBe(404);
            }

            const newClient = new QueueClient({
                connectionString,
                storageAccount,
                storageAccessKey,
                queueName: newQueueName,
                encoder,
                createQueueIfNotExists: false,
            });

            const payload = encoder.encode({ type: "test", payload: "content" });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };
            try {
                await newClient.write(spanContext, payload, headers);
            } catch (error) {
                expect((error as any).statusCode).toBe(404);
            }
        });
    });

    describe("writes", () => {
        it("writes a message to a queue with default configuration", async () => {
            const payload = encoder.encode({ type: "test", payload: "content" });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };

            const result: IQueueMessage = await client.write(spanContext, payload, headers);

            const expectedPayload = {
                type: "Buffer",
                data: [34, 99, 111, 110, 116, 101, 110, 116, 34],
            };

            expect(result.headers).toMatchObject(headers);
            expect(JSON.stringify(result.payload)).toBe(JSON.stringify(expectedPayload));
        });

        it("returns an error if the message is too big", async () => {
            // TODO change to relative path
            const content = fs.readFileSync("src/__test__/data/largeMessage.txt");
            const payload = encoder.encode({ type: "test", payload: content });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };

            expect.assertions(2);
            try {
                await client.write(spanContext, payload, headers);
            } catch (error) {
                expect((error as any).statusCode).toBe(413);
                expect((error as any).message).toBe(
                    "Queue Message too big, must be less than 64kb, is: 1582.1474609375"
                );
            }
        });
    });

    describe("reads", () => {
        it("reads messages from the queue", async () => {
            const payload = encoder.encode({ type: "test", payload: "content" });

            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };
            await client.write(spanContext, payload, headers);

            const result = await client.read(spanContext);

            expect(result.length).toBe(1);
            expect(result[0].headers).toMatchObject(headers);
        });
    });

    describe("fetches metadata", () => {
        it("retrieves up-to-date metadata for queues", async () => {
            const newQueueName = `queue-${Date.now()}`;

            const newClient = new QueueClient({
                connectionString,
                storageAccount,
                storageAccessKey,
                queueName: newQueueName,
                encoder,
                createQueueIfNotExists: true,
            });

            const payload = encoder.encode({ type: "test", payload: "content" });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };
            await newClient.write(spanContext, payload, headers);
            await newClient.write(spanContext, payload, headers);
            await newClient.write(spanContext, payload, headers);

            const result = await newClient.queueMetadata(spanContext, newQueueName);
            expect(result.approximateMessagesCount).toBe(3);
        });

        it("retrieves up-to-date metadata for queues", async () => {
            const payload = encoder.encode({ type: "test", payload: "content" });
            const headers = {
                [EventSourcedMetadata.EventType]: "test",
            };
            await client.write(spanContext, payload, headers);

            expect.assertions(1);
            try {
                await client.queueMetadata(spanContext, "unknownqueue");
            } catch (error) {
                expect((error as any).statusCode).toBe(404);
            }
        });
    });
});
