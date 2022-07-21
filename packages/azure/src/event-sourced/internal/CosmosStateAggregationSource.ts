/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    EncodedMessage,
    IAggregableState,
    IComponentContext,
    IDisposable,
    ILogger,
    IMessage,
    IMessageEncoder,
    IRequireInitialization,
    isEmbeddable,
    IStateAggregationSource,
    Lifecycle,
    makeLifecycle,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { ISnapshotProvider } from "..";
import { ICosmosQueryClient } from "../..";

export class CosmosStateAggregationSource<TSnapshot>
    implements IStateAggregationSource<TSnapshot>, IRequireInitialization, IDisposable
{
    private readonly client: Lifecycle<ICosmosQueryClient>;
    private readonly snapshot: Lifecycle<ISnapshotProvider<TSnapshot>>;
    private logger: ILogger;

    constructor(
        client: ICosmosQueryClient,
        private readonly encoder: IMessageEncoder,
        snapshot: ISnapshotProvider<TSnapshot>
    ) {
        this.client = makeLifecycle(client);
        this.snapshot = makeLifecycle(snapshot);
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        await this.client.initialize(context);
        await this.snapshot.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
        await this.snapshot.dispose();
    }

    public async load(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<IAggregableState<TSnapshot>> {
        let [snapshotSeqNum, snapshot] = await this.snapshot.get(spanContext, key, atSn);

        if (atSn !== undefined && snapshotSeqNum > atSn) {
            snapshotSeqNum = 0;
            snapshot = undefined;
        }

        const start = snapshotSeqNum + 1;
        const maxEvents = atSn !== undefined ? atSn - start + 1 : undefined;
        const topClause = maxEvents !== undefined ? "TOP @max" : "";
        const result = await this.client.query(spanContext, {
            query: `SELECT ${topClause} * FROM root r WHERE r.stream_id=@stream_id AND r.sn >= @sn ORDER BY r.sn ASC`,
            parameters: [
                { name: "@stream_id", value: key },
                { name: "@sn", value: start },
                { name: "@max", value: maxEvents },
            ],
        });

        let lastSn = snapshotSeqNum;
        const events: IMessage[] = [];
        for (const item of result) {
            const sn: number = item.sn;
            for (let gap = lastSn + 1; gap < sn; gap++) {
                this.logger.warn("data loss in event stream detected", {
                    key,
                    missingSeqNum: gap,
                });
            }

            if (atSn === undefined || sn <= atSn) {
                lastSn = sn;
                if (isEmbeddable(this.encoder)) {
                    events.push(
                        new EncodedMessage(
                            this.encoder,
                            item.event_type,
                            this.encoder.fromJsonEmbedding(item.encodedData)
                        )
                    );
                } else {
                    events.push(
                        new EncodedMessage(
                            this.encoder,
                            item.event_type,
                            new Uint8Array(item.encodedData.data)
                        )
                    );
                }
            }
        }

        return {
            events,
            lastSn,
            snapshot,
        };
    }
}
