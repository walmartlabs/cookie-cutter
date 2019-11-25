/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    EventSourcedMetadata,
    IComponentContext,
    IDisposable,
    IMessageDeduper,
    IRequireInitialization,
    Lifecycle,
    makeLifecycle,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { ICosmosQueryClient } from "../..";

export class CosmosMessageDeduper implements IMessageDeduper, IRequireInitialization, IDisposable {
    private readonly resolvedStreams: Map<string, number>;
    private readonly client: Lifecycle<ICosmosQueryClient>;

    constructor(client: ICosmosQueryClient) {
        this.client = makeLifecycle(client);
        this.resolvedStreams = new Map();
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        await this.client.initialize(ctx);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }

    public async isDupe(msg: MessageRef): Promise<{ dupe: boolean; message?: string }> {
        const streamId = msg.metadata<string>(EventSourcedMetadata.Stream);
        const sn = msg.metadata<number>(EventSourcedMetadata.SequenceNumber);

        if (streamId === undefined || sn === undefined) {
            return { dupe: false };
        }

        let val = this.resolvedStreams.get(streamId);
        if (val === undefined) {
            const result = await this.client.query(msg.spanContext, {
                query: `SELECT TOP 1 VALUE c.metadata.source.sn FROM c
                        WHERE c.metadata.source.stream_id=@stream_id
                        ORDER BY c.metadata.source.sn DESC`,
                parameters: [{ name: "@stream_id", value: streamId }],
            });

            if (result.length > 0) {
                val = result[0] as number;
                this.resolvedStreams.set(streamId, val);
            }
        }

        if (val !== undefined && sn <= val) {
            return {
                dupe: true,
                message: `message from stream '${streamId}' with sequence number ${sn} is below high-watermark of ${val}`,
            };
        }

        this.resolvedStreams.set(streamId, sn);
        return { dupe: false };
    }
}
