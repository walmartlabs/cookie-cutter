/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, EventSourcedMetadata, JsonMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import {
    QueueServiceClient,
    StorageRetryPolicyType,
    StorageSharedKeyCredential,
} from "@azure/storage-queue";
import { MockTracer, Span, SpanContext } from "opentracing";
import { IQueueConfiguration, IQueueSourceConfiguration, QueueMetadata } from "../../streaming";
import { QueueConfiguration, QueueSourceConfiguration } from "../../streaming/internal";
import { EnvelopeQueueMessagePreprocessor, QueueClient } from "../../utils";

jest.mock("@azure/storage-queue", () => {
    return {
        QueueServiceClient: jest.fn().mockImplementation(() => jest.fn()),
        StorageRetryPolicyType: jest.fn().mockImplementation(() => jest.fn()),
        StorageSharedKeyCredential: jest.fn().mockImplementation(() => jest.fn()),
    };
});

const MockQueueService: jest.Mock = QueueServiceClient as any;
const MockStorageRetryPolicyType: jest.Mock = StorageRetryPolicyType as any;
const MockStorageSharedKeyCredential: jest.Mock = StorageSharedKeyCredential as any;

describe("QueueClient", () => {
    const rawConfiguration = {
        queueName: "queue123",
        storageAccount: "myAccount",
        storageAccessKey: "myKey",
        encoder: new JsonMessageEncoder(),
        retryInterval: "5s",
        retryCount: 3,
        preprocessor: new EnvelopeQueueMessagePreprocessor(),
    } as any;
    const parseConfig = (raw: any): IQueueConfiguration => config.parse(QueueConfiguration, raw);
    const configuration = parseConfig(rawConfiguration);
    const context = new SpanContext();
    const span: Span = new MockTracer().startSpan("unit-test", { childOf: context });
    const payload = "hello world to queues";
    const headers = {
        [EventSourcedMetadata.EventType]: "foo",
    };

    const success = Promise.resolve({
        messageId: "message123",
        popReceipt: "pop123",
        insertedOn: Date.now(),
        expiresOn: Date.now(),
        nextVisibleOn: Date.now(),
        _response: {
            status: 200,
            bodyAsText: JSON.stringify({ headers, payload }),
            parsedBody: [],
        },
    });

    const mockMessages = [
        {
            messageId: 123,
            insertedOn: new Date(),
            expiresOn: new Date(),
            popReceipt: "pop123",
            nextVisibleOn: new Date(),
            dequeueCount: 1,
            messageText:
                '{ "headers": {"event_type": "event"}, "payload": {"testKey":"testValue"}}',
        },
        {
            messageId: 124,
            insertedOn: new Date(),
            expiresOn: new Date(),
            popReceipt: "pop124",
            nextVisibleOn: new Date(),
            dequeueCount: 1,
            messageText:
                "{ &quot;headers&quot;: {&quot;event_type&quot;: &quot;event&quot;}, &quot;payload&quot;: {&quot;testKey&quot;:&quot;testValue&quot;}}",
        },
    ];

    const getQueueClient = jest.fn(() => {
        return {
            sendMessage,
            receiveMessages,
            deleteMessage,

            create,
        };
    });
    const create = jest.fn(() => {
        return Promise.resolve({
            _response: {
                status: 200,
            },
        });
    });
    const sendMessage = jest.fn(() => {
        return success;
    });
    const receiveMessages = jest.fn(() => {
        return Promise.resolve({
            receivedMessageItems: mockMessages,
            _response: {
                status: 200,
            },
        });
    });
    const deleteMessage = jest.fn(() => {
        return success;
    });

    describe("write", () => {
        MockQueueService.mockImplementation(() => {
            return {
                getQueueClient,
            };
        });
        MockStorageRetryPolicyType.mockImplementation(() => {
            return 0; // LINEAR
        });
        MockStorageSharedKeyCredential.mockImplementation(() => {
            return {
                accountName: "accountName",
                accountKey: "123",
            };
        });
        const client = new QueueClient(configuration);
        it("should write message with defaults", async () => {
            const result = await client.write(span.context(), payload, headers);
            expect(result).toBeDefined();
            expect(getQueueClient).toBeCalledWith("queue123");
            expect(sendMessage).toBeCalledWith(JSON.stringify({ payload, headers }), undefined);
        });
        it("should write message with options", async () => {
            const options = {
                queueName: "different",
                visibilityTimeout: 1233,
                messageTimeToLive: 124,
            };
            await client.write(span.context(), payload, headers, options);
            expect(sendMessage).toBeCalledWith(JSON.stringify({ payload, headers }), options);
            expect(getQueueClient).toBeCalledWith(options.queueName);
        });
        it("should pass client failure up", async () => {
            const error = new Error("something bad happend");
            sendMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            await expect(client.write(span.context(), payload, headers)).rejects.toEqual(error);
        });
        it("should error if text is to big", async () => {
            const bigText = Buffer.alloc(65 * 1024);
            const result = client.write(span.context(), bigText, headers);
            expect(sendMessage).not.toBeCalled();
            await expect(result).rejects.toEqual(
                new Error("Queue Message too big, must be less than 64kb, is: 173.423828125")
            );
        });

        it("should error get back 413 from azure", async () => {
            const bigText = Buffer.alloc(1024);
            const error: Error & { statusCode?: number } = new Error(
                "The request body is too large and exceeds the maximum permissible limit."
            );
            error.statusCode = 413;
            sendMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            const result = client.write(span.context(), bigText, headers);
            expect(sendMessage).toBeCalled();
            await expect(result).rejects.toEqual(error);
        });

        it("should retry on 404s if configured to", async () => {
            const error = new Error("something bad happend") && { statusCode: 404 };
            sendMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            sendMessage.mockImplementation(() => {
                return success;
            });
            const configuredClient = new QueueClient({
                ...configuration,
                createQueueIfNotExists: true,
            });
            const result = await configuredClient.write(span.context(), payload, headers);
            expect(sendMessage).toBeCalledTimes(2);
            expect(create).toBeCalled();
            expect(result).toBeDefined();
        });
        it("should not retry on 404s if not configured to", async () => {
            const error = new Error("something bad happend") && { statusCode: 404 };
            sendMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            const result = client.write(span.context(), payload, headers);
            await expect(result).rejects.toMatchObject({ statusCode: 404 });
            expect(create).not.toBeCalled();
            expect(sendMessage).toBeCalledTimes(1);
        });

        it("should not retry on other errors (even if configured to)", async () => {
            const error = new Error("something bad happend") && { statusCode: 401 };
            sendMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            const configuredClient = new QueueClient({
                ...configuration,
                createQueueIfNotExists: true,
            });
            const result = configuredClient.write(span.context(), payload, headers);
            await expect(result).rejects.toMatchObject({ statusCode: 401 });
            expect(create).not.toBeCalled();
            expect(sendMessage).toBeCalledTimes(1);
        });
    });

    describe("read", () => {
        const client = new QueueClient(configuration);
        it("should read messages with defaults", async () => {
            const messages = await client.read(span.context());
            expect(messages).toHaveLength(mockMessages.length);
            messages.forEach((message, i) => {
                expect(message.headers[QueueMetadata.MessageId]).toBe(mockMessages[i].messageId);
                expect(message.headers[QueueMetadata.PopReceipt]).toBe(mockMessages[i].popReceipt);
                expect(message.payload).toStrictEqual({ testKey: "testValue" });
            });
            expect(receiveMessages).toBeCalledWith({
                numOfMessages: undefined,
                visibilityTimeout: undefined,
            });
        });
        it("should read messages with options", async () => {
            let options: IQueueConfiguration & IQueueSourceConfiguration = {
                storageAccount: "storageAcc",
                storageAccessKey: "storageKey",
                queueName: "different",
                createQueueIfNotExists: false,
                encoder: new JsonMessageEncoder(),
                numOfMessages: 20,
                visibilityTimeout: 60000,
            };
            options = config.parse(QueueSourceConfiguration, options, {
                retryCount: 3,
                retryInterval: 5000,
                largeItemBlobContainer: "queue-large-items",
                createQueueIfNotExists: false,
                preprocessor: new EnvelopeQueueMessagePreprocessor(),
            });
            await client.read(span.context(), options);
            expect(receiveMessages).toBeCalledWith({
                numberOfMessages: options.numOfMessages,
                visibilityTimeout: options.visibilityTimeout,
            });
        });
        it("should raise error", async () => {
            const error = new Error("something went wrong");
            receiveMessages.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            const result = client.read(span.context());
            await expect(result).rejects.toEqual(error);
        });
    });

    describe("markAsProcessed", () => {
        const client = new QueueClient(configuration);
        it("should delete message when processed with default queue name", async () => {
            await client.markAsProcessed(span.context(), "123", "pop123");
            expect(deleteMessage).toBeCalledWith("123", "pop123");
        });
        it("should delete message when processed with different queue name", async () => {
            const options = { queueName: "different" };
            await client.markAsProcessed(span.context(), "123", "pop123", options.queueName);

            expect(getQueueClient).toBeCalledWith(options.queueName);
            expect(deleteMessage).toBeCalledWith("123", "pop123");
        });
        it("should raise error", async () => {
            const error = new Error("something went wrong");
            deleteMessage.mockImplementationOnce(() => {
                return Promise.reject(error);
            });
            const result = client.markAsProcessed(span.context(), "123", "pop123");
            await expect(result).rejects.toEqual(error);
        });
    });
});
