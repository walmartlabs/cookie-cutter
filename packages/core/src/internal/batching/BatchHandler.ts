/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IBatchResult } from ".";
import { BufferedDispatchContext } from "..";
import { IOutputSink, OutputSinkConsistencyLevel, SequenceConflictError } from "../../model";
import { iterate, RetrierContext } from "../../utils";
import { batch, BelongsToSameGroupFunc, count } from "./helper";

export class BatchHandler<T> {
    constructor(
        private readonly target: IOutputSink<T>,
        private readonly accessor: (item: BufferedDispatchContext) => IterableIterator<T>,
        private readonly grouping: BelongsToSameGroupFunc<T> = () => true
    ) {}

    public async handle(
        items: BufferedDispatchContext[],
        retry: RetrierContext,
        batchSize?: number
    ): Promise<IBatchResult> {
        const total = count(items, this.accessor);
        if (total === 0) {
            return { successful: items, failed: [] };
        }

        batchSize = batchSize || this.target.guarantees.maxBatchSize || total;
        let completedContexts = 0;
        try {
            for (const chunk of batch(items, this.accessor, this.grouping, batchSize)) {
                await this.target.sink(iterate(chunk.batch), retry);
                completedContexts += chunk.completed.length;
            }

            return { successful: items, failed: [] };
        } catch (e) {
            // for big batches do binary search to narrow down
            // which BufferedDispatchContext caused the error
            // so we don't have to reprocess too much data
            if (this.mayRetry(items) && batchSize > 1) {
                const done = items.slice(0, completedContexts);
                const remaining = items.slice(completedContexts);
                const result = await this.handle(remaining, retry, Math.floor(batchSize / 2));
                return {
                    successful: done.concat(result.successful),
                    failed: result.failed,
                    error: result.error,
                };
            }

            return {
                successful: items.slice(0, completedContexts),
                failed: items.slice(completedContexts),
                error: {
                    error: e as any,
                    retryable: e instanceof SequenceConflictError || this.mayRetry(items),
                },
            };
        }
    }

    private mayRetry(items: BufferedDispatchContext[]): boolean {
        return (
            this.target.guarantees.consistency === OutputSinkConsistencyLevel.Atomic ||
            this.target.guarantees.consistency === OutputSinkConsistencyLevel.AtomicPerPartition ||
            items.length === 1
        );
    }
}
