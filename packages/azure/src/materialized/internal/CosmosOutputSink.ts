/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IOutputSink,
    IOutputSinkGuarantees,
    isStoredMessage,
    IStateVerification,
    IStoredMessage,
    OutputSinkConsistencyLevel,
    RetrierContext,
    SequenceConflictError,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { isNullOrUndefined } from "util";
import { ICosmosConfiguration, CosmosMetadata } from "../..";
import {
    cosmosMetadata,
    CosmosOutputSinkBase,
    getSequenceConflictDetails,
    ICosmosDocument,
    isRetryableError,
    isSequenceConflict,
    RETRY_AFTER_MS,
} from "../../utils";

export class CosmosOutputSink extends CosmosOutputSinkBase implements IOutputSink<IStoredMessage> {
    constructor(config: ICosmosConfiguration) {
        super(config);
    }

    public async sink(
        output: IterableIterator<IStoredMessage | IStateVerification>,
        retry: RetrierContext
    ): Promise<void> {
        let state: StateRef<any> | undefined;
        let message: IStoredMessage | undefined;
        let spanContext: SpanContext | undefined;
        let count: number = 0;
        for (const msg of output) {
            state = state || msg.state; // first
            spanContext = spanContext || (isStoredMessage(msg) ? msg.spanContext : undefined); // first
            message = isStoredMessage(msg) ? msg : undefined; // last
            count++;
        }

        if (message !== undefined) {
            const record: ICosmosDocument = {
                stream_id: state.key,
                sn: state.seqNum + count,
                event_type: message.message.type,
                data: isNullOrUndefined(message.message.payload)
                    ? undefined
                    : this.formatData(message.message),
                id: state.key,
                trace: spanContext,
                dt: Date.now(),
                metadata: {
                    ...cosmosMetadata(message.original),
                },
                ttl: message.metadata ? message.metadata[CosmosMetadata.TTL] : undefined,
            };

            try {
                await this.client.upsert(record, state.key, state.seqNum);
            } catch (e) {
                if (isRetryableError(e as any)) {
                    if ((e as any).headers && (e as any).headers[RETRY_AFTER_MS]) {
                        retry.setNextRetryInterval(
                            parseInt((e as any).headers[RETRY_AFTER_MS], 10)
                        );
                    }
                    throw e;
                } else if (isSequenceConflict(e as any)) {
                    retry.bail(new SequenceConflictError(getSequenceConflictDetails(e as any)));
                } else {
                    retry.bail(e);
                }
            }
        } else if (state !== undefined) {
            try {
                const result = await this.client.query(spanContext, {
                    query: "SELECT VALUE MAX(c.sn) FROM c WHERE c.stream_id = @streamId",
                    parameters: [{ name: "@streamId", value: state.key }],
                });

                const actualSn = result[0] || 0;
                if (state.seqNum !== actualSn) {
                    throw new SequenceConflictError({
                        actualSn,
                        key: state.key,
                        expectedSn: state.seqNum,
                        newSn: state.seqNum,
                    });
                }
            } catch (e) {
                if (isRetryableError(e as any)) {
                    if ((e as any).headers && (e as any).headers[RETRY_AFTER_MS]) {
                        retry.setNextRetryInterval(
                            parseInt((e as any).headers[RETRY_AFTER_MS], 10)
                        );
                    }
                    throw e;
                } else if (isSequenceConflict(e as any)) {
                    retry.bail(new SequenceConflictError(getSequenceConflictDetails(e as any)));
                } else {
                    retry.bail(e);
                }
            }
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.AtomicPerPartition,
            idempotent: false,
            maxBatchSize: undefined, // entire batch will always result in a single update
        };
    }
}
