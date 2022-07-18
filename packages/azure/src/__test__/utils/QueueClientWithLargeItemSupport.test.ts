/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IComponentContext } from "@walmartlabs/cookie-cutter-core";
import { MockTracer, SpanContext } from "opentracing";
import { BlobClient, QueueClient } from "../../utils";
import {
    PATH_HEADER,
    QueueClientWithLargeItemSupport,
} from "../../utils/QueueClientWithLargeItemSupport";

describe("QueueClientWithLargeItemSupport", () => {
    const tracer = new MockTracer();
    const context = {} as unknown as SpanContext;
    const payload = "hello world to queues";
    const headers = {};
    const messageQueueResult = {
        messageId: "message123",
        popReceipt: "pop123",
        messageText: JSON.stringify({ headers, payload }),
        headers,
        payload,
    };
    const buildClient = () => {
        const mocks = {
            blobInit: jest.fn(),
            blobRead: jest.fn(),
            blobWrite: jest.fn(),
            queueInit: jest.fn(),
            queueRead: jest.fn(),
            queueWrite: jest.fn(),
            createContainerIfNotExists: jest.fn(),
        };
        const blob = {
            initialize: mocks.blobInit,
            readAsText: mocks.blobRead,
            write: mocks.blobWrite,
            createContainerIfNotExists: mocks.createContainerIfNotExists,
        };
        const queue = {
            initialize: mocks.queueInit,
            read: mocks.queueRead,
            write: mocks.queueWrite,
        };
        const client = new QueueClientWithLargeItemSupport(
            queue as unknown as QueueClient,
            blob as unknown as BlobClient
        );
        return {
            blob,
            queue,
            client,
        };
    };

    describe("initialization", () => {
        it("should initialize underlying clients", async () => {
            const { client, blob, queue } = buildClient();
            await client.initialize({} as IComponentContext);
            expect(blob.initialize).toBeCalled();
            expect(queue.initialize).toBeCalled();
        });
        it("should initialize container", async () => {
            const { client, blob } = buildClient();
            await client.initialize({} as IComponentContext);
            expect(blob.createContainerIfNotExists).toBeCalled();
        });
    });
    describe("write", () => {
        it("should not do anything if write succeeds", async () => {
            const { client, blob, queue } = buildClient();
            await client.write(context, payload, headers);
            expect(queue.write).toBeCalled();
            expect(blob.write).not.toBeCalled();
        });
        it("should write to blob if error is 413", async () => {
            const { client, blob, queue } = buildClient();
            const error: Error & { code?: number } = new Error("test");
            error.code = 413;
            queue.write.mockRejectedValueOnce(error);
            await client.initialize({ tracer } as unknown as IComponentContext);
            await client.write(context, payload, headers);
            expect(queue.write).toBeCalledTimes(2);
            expect(blob.write).toBeCalled();
        });
    });
    describe("read", () => {
        it("should not read from blob if no blob header", async () => {
            const { client, queue, blob } = buildClient();
            queue.read.mockResolvedValue([messageQueueResult]);
            const result = await client.read(context);
            expect(result[0]).toMatchObject(messageQueueResult);
            expect(blob.readAsText).not.toBeCalled();
        });
        it("should read from blob if blob header", async () => {
            const { client, queue, blob } = buildClient();
            const path = "test/test";
            const messageResult = {
                ...messageQueueResult,
                headers: {
                    ...messageQueueResult.headers,
                    [PATH_HEADER]: path,
                },
                payload: null,
            };
            queue.read.mockResolvedValue([messageResult]);
            blob.readAsText.mockResolvedValue(messageQueueResult.messageText);
            const result = await client.read(context);
            expect(blob.readAsText).toBeCalled();
            expect(result[0]).toMatchObject(messageQueueResult);
        });
        it("should read mixed", async () => {
            const { client, queue, blob } = buildClient();
            const path = "test/test";
            const messageResult = {
                ...messageQueueResult,
                headers: {
                    ...messageQueueResult.headers,
                    [PATH_HEADER]: path,
                },
                payload: null,
            };
            queue.read.mockResolvedValue([messageResult, messageQueueResult]);
            blob.readAsText.mockResolvedValue(messageQueueResult.messageText);
            const result = await client.read(context);
            expect(blob.readAsText).toBeCalledTimes(1);
            expect(result).toMatchObject([messageQueueResult, messageQueueResult]);
        });
    });
});
