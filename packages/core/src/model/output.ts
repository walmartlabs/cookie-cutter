/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from "../internal";
import { RetrierContext } from "../utils";

export enum OutputSinkConsistencyLevel {
    /*
     * The sink does not make any guarantees, any element passed to the sink may
     * succeed or fail independently. Retries may result in duplicate outputs.
     */
    None = 0,
    /*
     * The sink is fully atomic, either all or no items of the batch will succeed.
     */
    Atomic = 1,
    /*
     * The sink supports atomicity on a per partition basis. Multiple items
     * can be batched safely as long as they belong to the same partition. The
     * sink makes no guarantees for batches that span multiple partitions.
     */
    AtomicPerPartition = 2,
}

export interface IOutputSinkGuarantees {
    readonly idempotent: boolean;
    readonly consistency: OutputSinkConsistencyLevel;
    readonly maxBatchSize?: number;
}

export interface IOutputSink<T> {
    sink(output: IterableIterator<T>, retry: RetrierContext): Promise<void>;
    readonly guarantees: IOutputSinkGuarantees;
}

export interface ISequenceConflictDetails {
    readonly key: string;
    readonly newSn: number;
    readonly expectedSn: number;
    readonly actualSn: number;
    readonly expectedEpoch?: number;
    readonly actualEpoch?: number;
}

export class SequenceConflictError extends Error {
    constructor(
        public readonly details: ISequenceConflictDetails,
        public readonly context?: BufferedDispatchContext
    ) {
        super(
            `failed to store message due to sequence number conflict: key: ${details.key}, newSn: ${details.newSn}, expectedSn: ${details.expectedSn} actualSn: ${details.actualSn}`
        );
        Error.captureStackTrace(this, SequenceConflictError);
    }

    public toJSON(): any {
        return {
            // don't add 'context' as it
            // cannot be serialized
            details: this.details,
            stack: this.stack,
            message: this.message,
            name: this.name,
        };
    }
}
