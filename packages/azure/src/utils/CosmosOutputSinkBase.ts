/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IComponentContext,
    IDisposable,
    ILogger,
    IMessage,
    IMessageEncoder,
    IOutputSinkGuarantees,
    IRequireInitialization,
    isEmbeddable,
    OutputSinkConsistencyLevel,
    RetrierContext,
    SequenceConflictError,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext, Tracer } from "opentracing";
import {
    CosmosClient,
    getSequenceConflictDetails,
    ICosmosDocument,
    isRetryableError,
    isSequenceConflict,
} from ".";
import { ICosmosConfiguration } from "..";
import { RETRY_AFTER_MS } from "./CosmosClient";

export class CosmosOutputSinkBase implements IRequireInitialization, IDisposable {
    protected readonly client: CosmosClient;
    protected readonly encoder: IMessageEncoder;

    protected logger: ILogger;
    protected tracer: Tracer;

    constructor(config: ICosmosConfiguration) {
        this.encoder = config.encoder;
        this.client = new CosmosClient(config);
        this.logger = DefaultComponentContext.logger;
        this.tracer = DefaultComponentContext.tracer;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        this.tracer = context.tracer;
        await this.client.initialize(context);
    }

    public dispose(): Promise<void> {
        return this.client.dispose();
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.AtomicPerPartition,
            idempotent: false,
            maxBatchSize: 200, // 2MB limit for requests to Cosmos, 10KB per document for large outputs
        };
    }

    protected async doBulkInsert(
        documents: ICosmosDocument[],
        verifySn: boolean,
        retry: RetrierContext
    ): Promise<void> {
        if (documents.length < 1) {
            return;
        }
        const partitionKey = documents[0].stream_id;

        try {
            return await this.client.bulkInsert(documents, partitionKey, verifySn);
        } catch (e) {
            if (isRetryableError(e as any)) {
                if ((e as any).headers && (e as any).headers[RETRY_AFTER_MS]) {
                    retry.setNextRetryInterval(parseInt((e as any).headers[RETRY_AFTER_MS], 10));
                }
                throw e;
            } else if (isSequenceConflict(e as any)) {
                retry.bail(new SequenceConflictError(getSequenceConflictDetails(e as any)));
            } else {
                retry.bail(e);
            }
        }
    }

    protected formatData(msg: IMessage): any {
        const buffer = this.encoder.encode(msg);
        if (isEmbeddable(this.encoder)) {
            return this.encoder.toJsonEmbedding(buffer);
        }

        return buffer;
    }

    protected async verifyState(
        stateRef: StateRef,
        spanContext: SpanContext,
        retry: RetrierContext
    ): Promise<void> {
        try {
            const result = await this.client.query(spanContext, {
                query: "SELECT VALUE MAX(c.sn) FROM c WHERE c.stream_id = @streamId",
                parameters: [{ name: "@streamId", value: stateRef.key }],
            });

            const actualSn = result[0] || 0;
            if (stateRef.seqNum !== actualSn) {
                throw new SequenceConflictError({
                    actualSn,
                    key: stateRef.key,
                    expectedSn: stateRef.seqNum,
                    newSn: stateRef.seqNum,
                });
            }
        } catch (e) {
            if (isRetryableError(e as any)) {
                if ((e as any).headers && (e as any).headers[RETRY_AFTER_MS]) {
                    retry.setNextRetryInterval(parseInt((e as any).headers[RETRY_AFTER_MS], 10));
                }
                throw e;
            } else {
                retry.bail(e);
            }
        }
    }
}
