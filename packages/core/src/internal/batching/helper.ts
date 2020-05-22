/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext, EpochManager } from "..";
import { IBatchResult } from ".";
import { SequenceConflictError } from "../..";
import { StateRef } from "../../model";

export type BelongsToSameGroupFunc<T> = (prev: T | undefined, current: T) => boolean;

export function* batch<T, U>(
    items: T[],
    accessor: (item: T) => IterableIterator<U>,
    grouping: BelongsToSameGroupFunc<U>,
    maxBatchSize?: number
): IterableIterator<{ batch: U[]; completed: T[] }> {
    let batch: U[] = [];
    let completed: T[] = [];

    if (maxBatchSize <= 0) {
        throw new Error(`invalid maxBatchSize '${maxBatchSize}'`);
    }

    // top-level containers are messages published/stored
    // by a single handler function invocation
    for (const container of items) {
        const items = Array.from(accessor(container));

        // group all items of a single container into groups
        // that are allowed to go together, e.g. if a single
        // handler function calls store for multiple streams
        // and the sink is only transactional by stream then
        // we need to take this into account when creating batches
        const groups = groupBy(items, grouping);

        let done = 0;
        for (let group of groups) {
            // the current batch and the next group may
            // not be allowed to go together
            if (
                batch.length > 0 &&
                group.length > 0 &&
                !grouping(batch[batch.length - 1], group[0])
            ) {
                yield { batch, completed };
                batch = [];
                completed = [];
            }

            // we cannot ensure atomicity if a group is bigger than the maximum batch size
            if (group.length > maxBatchSize) {
                while (group.length > 0) {
                    const free = maxBatchSize - batch.length;
                    const next = group.slice(0, free);
                    batch.push(...next);
                    done += next.length;
                    if (done === items.length) {
                        completed.push(container);
                    }

                    yield { batch, completed };
                    batch = [];
                    completed = [];
                    group = group.slice(free);
                }
            } else {
                const hasCapacity =
                    maxBatchSize === undefined || batch.length + items.length <= maxBatchSize;
                if (!hasCapacity) {
                    yield { batch, completed };
                    batch = [];
                    completed = [];
                }

                batch.push(...group);
                done += group.length;
                if (done === items.length) {
                    completed.push(container);
                }
            }
        }
    }

    if (batch.length > 0) {
        yield { batch, completed };
    }
}

export function count<T>(
    items: BufferedDispatchContext[],
    accessor: (item: BufferedDispatchContext) => IterableIterator<T>
): number {
    return items.reduce((p, c) => Array.from(accessor(c)).length + p, 0);
}

export function filterByEpoch<T>(
    items: T[],
    accessor: (item: T) => StateRef[],
    epochs: EpochManager
): IBatchResult<T> {
    // This filtering logic only applies if epochs are enabled, which
    // is the case for RPC mode + state caching enabled
    //
    // Whenever there is sequence conflict we increment the epoch
    // counter for that key. If we see an output here that is based
    // on a stateRef with an earlier epoch then we can immediately
    // discard it because it is based on a stale state.
    for (let i = 0; i < items.length; i++) {
        const bad = accessor(items[i]).filter(
            (s) => s.epoch !== undefined && s.epoch < epochs.get(s.key)
        );
        if (bad.length > 0) {
            return {
                successful: items.slice(0, i),
                failed: items.slice(i),
                error: {
                    error: new SequenceConflictError({
                        key: bad[0].key,
                        actualSn: bad[0].seqNum,
                        expectedSn: bad[0].seqNum,
                        newSn: bad[0].seqNum,
                        actualEpoch: bad[0].epoch,
                        expectedEpoch: epochs.get(bad[0].key),
                    }),
                    retryable: false,
                },
            };
        }
    }

    return {
        successful: items,
        failed: [],
    };
}

export function filterNonLinearStateChanges<T>(
    items: T[],
    accessor: (item: T) => [number, StateRef[]]
): IBatchResult<T> {
    // This filtering logic only applies if epochs are enabled, which
    // is the case for RPC mode + state caching enabled
    //
    // When multiple handlers execute concurrently it is possible that
    // they will create competing branches based on the same state
    //
    //  -----------------
    //  |  state cache  |
    //  -----------------
    //  | stateRef sn=1 |-----------------|
    //  -----------------                 |
    //         |                          |
    //         |                          |
    //         v                          v
    //  ------------------          ------------------
    //  |  input msg A   |          |  input msg B   |
    //  ------------------          ------------------
    //  | ctx.state.get  |          | ctx.state.get()|
    //  | ctx.store(...) |          | ctx.store(...) |
    //  ------------------          ------------------
    //  | sn = 2         |          | sn = 2         |
    //  ------------------          ------------------
    //
    // This function will detect these kind of conflicts
    // and raise a Sequence Conflict error for the first
    // output that would result in a non-linear state changes.
    const lookup = new Map<string, { sn: number; seq: number }>();
    for (let i = 0; i < items.length; i++) {
        const [seq, states] = accessor(items[i]);
        for (const state of states) {
            const l = lookup.get(state.key);
            if (!l) {
                lookup.set(state.key, { sn: state.seqNum + 1, seq });
            } else if (l.seq === seq || l.sn === state.seqNum) {
                lookup.set(state.key, { sn: l.sn + 1, seq });
            } else {
                return {
                    successful: items.slice(0, i),
                    failed: items.slice(i),
                    error: {
                        error: new SequenceConflictError({
                            actualSn: l.sn,
                            key: state.key,
                            expectedSn: state.seqNum,
                            newSn: state.seqNum + 1,
                        }),
                        retryable: false,
                    },
                };
            }
        }
    }

    return {
        successful: items,
        failed: [],
    };
}

function* groupBy<T>(items: T[], grouping: BelongsToSameGroupFunc<T>): IterableIterator<T[]> {
    let group: T[] = [];
    for (let i = 0; i < items.length; i++) {
        if (i === 0 || grouping(items[i - 1], items[i])) {
            group.push(items[i]);
        } else {
            yield group;
            group = [items[i]];
        }
    }

    if (group.length > 0) {
        yield group;
    }
}
