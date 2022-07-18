/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { failSpan, IComponentContext } from "@walmartlabs/cookie-cutter-core";
import { SpanContext, Tracer } from "opentracing";
import { v4 } from "uuid";
import { IQueueConfiguration } from "../streaming";
import { BlobClient } from "./BlobClient";
import {
    IQueueCreateMessageOptions,
    IQueueMessage,
    IQueueReadOptions,
    QueueClient,
} from "./QueueClient";

export const PATH_HEADER = "queue.largeObjectBlobPath";

export class QueueClientWithLargeItemSupport {
    public static create(config: IQueueConfiguration): QueueClient {
        const queueClient = new QueueClient(config);
        const blobClient = new BlobClient({
            url: config.url,
            storageAccessKey: config.storageAccessKey,
            storageAccount: config.storageAccount,
            container: config.largeItemBlobContainer,
        });
        const withLargeItemSupport = new QueueClientWithLargeItemSupport(queueClient, blobClient);

        return {
            initialize: withLargeItemSupport.initialize.bind(withLargeItemSupport),
            read: withLargeItemSupport.read.bind(withLargeItemSupport),
            write: withLargeItemSupport.write.bind(withLargeItemSupport),
            queueMetadata: queueClient.queueMetadata.bind(queueClient),
            defaultQueue: queueClient.defaultQueue,
            markAsProcessed: queueClient.markAsProcessed.bind(queueClient),
        } as QueueClient;
    }

    private tracer: Tracer;

    /** use WithLargeItemSupport.create unless in testing */
    constructor(private queueClient: QueueClient, private blobClient: BlobClient) {}

    public async initialize(context: IComponentContext) {
        this.tracer = context.tracer;
        await this.queueClient.initialize(context);
        await this.blobClient.initialize(context);
        await this.blobClient.createContainerIfNotExists();
    }

    public async write(
        spanContext: SpanContext,
        payload: any,
        headers: Record<string, string>,
        options?: IQueueCreateMessageOptions
    ): Promise<IQueueMessage> {
        try {
            return await this.queueClient.write(spanContext, payload, headers, options);
        } catch (error) {
            if ((error as any).code !== 413) {
                throw error;
            }
            return this.writeLargeObject(spanContext, payload, headers, options);
        }
    }

    public async read(
        spanContext: SpanContext,
        options?: IQueueReadOptions
    ): Promise<IQueueMessage[]> {
        const result = await this.queueClient.read(spanContext, options);
        const hydratedResults: IQueueMessage[] = [];

        for (const message of result) {
            if (!message.headers || !message.headers[PATH_HEADER]) {
                hydratedResults.push(message);
                continue;
            }
            const path = message.headers[PATH_HEADER];
            const document = await this.blobClient.readAsText(spanContext, path);
            const { headers, payload } = JSON.parse(document);
            hydratedResults.push({
                ...message,
                headers,
                payload,
            });
        }

        return hydratedResults;
    }

    private async writeLargeObject(
        spanContext: SpanContext,
        payload: any,
        headers: Record<string, string>,
        options?: IQueueCreateMessageOptions
    ): Promise<IQueueMessage> {
        const span = this.tracer.startSpan("QUEUE LARGE OBJECT PROCESSING", {
            childOf: spanContext,
        });
        const queueName = (options && options.queueName) || this.queueClient.defaultQueue;
        const path = `${queueName}/${v4()}`;
        await this.blobClient.write(span.context(), path, JSON.stringify({ headers, payload }));
        const headersWithPath = {
            ...(headers || {}),
            [PATH_HEADER]: path,
        };
        try {
            const result = await this.queueClient.write(
                span.context(),
                null,
                headersWithPath,
                options
            );
            span.finish();
            return result;
        } catch (e) {
            failSpan(span, e);
            throw e;
        }
    }
}
