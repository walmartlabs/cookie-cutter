/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IComponentContext,
    IDisposable,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    Lifecycle,
    makeLifecycle,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { IBigQueryClient } from ".";

export enum BigQueryMetadata {
    table = "bigQuery.table",
}

interface IRequest {
    body: any;
    table: string;
    spanContext: SpanContext;
}

export class BigQuerySink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable
{
    private readonly client: Lifecycle<IBigQueryClient>;
    constructor(client: IBigQueryClient, readonly maxBatchSize: number) {
        this.client = makeLifecycle(client);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.client.initialize(context);
    }

    public dispose(): Promise<void> {
        return this.client.dispose();
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const groupedMessages = new Map<string, IRequest[]>();

        for (const msg of output) {
            const table = msg.metadata[BigQueryMetadata.table];
            if (!table) {
                throw new Error("table metadata field required for BigQuerySink messages");
            }

            const request = {
                body: msg.message.payload,
                table,
                spanContext: msg.spanContext,
            };

            if (groupedMessages.has(table)) {
                groupedMessages.get(table).push(request);
            } else {
                groupedMessages.set(table, [request]);
            }
        }

        const requests: Promise<void>[] = [];
        groupedMessages.forEach((values: IRequest[], table: string) => {
            for (let i = 0, j = values.length; i < j; i += this.maxBatchSize) {
                const insertMessages = values.slice(i, i + this.maxBatchSize);
                const spanContext = insertMessages[0].spanContext;
                const bodies = insertMessages.map((m) => m.body);
                requests.push(this.client.putObject(spanContext, bodies, table));
            }
        });

        await Promise.all(requests);
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: true,
        };
    }
}
