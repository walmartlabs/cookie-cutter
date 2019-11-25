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
    IRequireInitialization,
    IStoredMessage,
    Lifecycle,
    makeLifecycle,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { IGcsClient } from ".";

interface IRequest {
    body: Buffer;
    key: string;
    spanContext: SpanContext;
}

export class GcsSink implements IOutputSink<IStoredMessage>, IRequireInitialization, IDisposable {
    private readonly client: Lifecycle<IGcsClient>;
    constructor(client: IGcsClient) {
        this.client = makeLifecycle(client);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.client.initialize(context);
    }

    public dispose(): Promise<void> {
        return this.client.dispose();
    }

    public async sink(output: IterableIterator<IStoredMessage>): Promise<void> {
        const requests: IRequest[] = [];
        for (const msg of output) {
            const body = msg.message.payload;
            const key = msg.state.key;
            if (!key) {
                throw new Error("key metadata field required for GCSSink messages");
            }
            requests.push({ body, key, spanContext: msg.spanContext });
        }

        await Promise.all(requests.map((request) => this.makeRequest(request)));
    }

    private async makeRequest({ body, key, spanContext }: IRequest): Promise<void> {
        await this.client.putObject(spanContext, body, key);
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: true,
        };
    }
}
