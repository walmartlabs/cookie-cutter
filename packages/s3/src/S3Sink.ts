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
import { IS3Client, IS3PublisherConfiguration, S3Metadata } from ".";

interface IRequest {
    type: string;
    body: string;
    bucket: string;
    key: string;
    spanContext: SpanContext;
}

export class S3Sink implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    private readonly client: Lifecycle<IS3Client>;

    constructor(private readonly config: IS3PublisherConfiguration, client: IS3Client) {
        this.client = makeLifecycle(client);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.client.initialize(context);
    }

    public dispose(): Promise<void> {
        return this.client.dispose();
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const requests: IRequest[] = [];
        for (const msg of output) {
            const body = msg.message.payload;
            const type = msg.message.type;
            const bucket = msg.metadata[S3Metadata.Bucket] || this.config.defaultBucket;
            const key = msg.metadata[S3Metadata.Key];
            if (!key) {
                throw new Error("key metadata field required for S3Sink messages");
            }
            requests.push({ body, type, bucket, key, spanContext: msg.spanContext });
        }

        await Promise.all(requests.map((request) => this.makeRequest(request)));
    }

    private async makeRequest({ type, body, bucket, key, spanContext }: IRequest): Promise<void> {
        if (!body) {
            await this.client.deleteObject(spanContext, bucket, key);
        } else {
            await this.client.putObject(spanContext, type, body, bucket, key);
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: true,
        };
    }
}
