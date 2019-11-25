/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from "..";

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
