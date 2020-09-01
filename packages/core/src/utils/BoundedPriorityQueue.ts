/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { isNullOrUndefined } from "util";
import { Future } from ".";

export class BoundedPriorityQueue<T> {
    private readonly queues: Map<number, T[]>;
    private whenNotEmpty: Future<void>;
    private whenNotFullList: Map<number, Future<void>>;
    private sortedPriorities: number[];
    private total_count: number;
    private closed: boolean;

    constructor(private readonly capacity: number) {
        this.total_count = 0;
        this.queues = new Map();
        this.sortedPriorities = [];
        this.whenNotEmpty = new Future();
        this.whenNotFullList = new Map();
        this.closed = false;
    }

    public update(predicate: (T) => boolean, op: (T) => void): void {
        for (const queue of this.queues.values()) {
            for (const item of queue) {
                if (predicate(item)) {
                    op(item);
                }
            }
        }
    }

    public async enqueue(item: T, priority = 0): Promise<boolean> {
        let queue = this.queues.get(priority);
        if (queue === undefined) {
            queue = [];
            this.queues.set(priority, queue);
            this.whenNotFullList.set(priority, new Future());
            this.sortedPriorities.push(priority);
            this.sortedPriorities = this.sortedPriorities.sort((n1, n2) => Math.sign(n2 - n1));
        }

        if (queue.length < this.capacity) {
            queue.push(item);
            if (++this.total_count === 1) {
                this.whenNotEmpty.resolve();
            }
            return true;
        }

        const whenNotFull = this.whenNotFullList.get(priority);
        if (whenNotFull) {
            await whenNotFull.promise;
        }
        if (this.closed) {
            return false;
        }

        if (isNullOrUndefined(whenNotFull)) {
            this.whenNotFullList.set(priority, new Future());
        }
        return this.enqueue(item, priority);
    }

    public async dequeue(): Promise<T> {
        if (this.closed && this.total_count === 0) {
            throw new Error("queue is closed");
        }

        for (const priority of this.sortedPriorities) {
            const queue = this.queues.get(priority)!;
            const whenNotFull = this.whenNotFullList.get(priority);
            if (queue.length > 0) {
                const item = queue.shift();
                this.total_count--;
                if (queue.length + 1 === this.capacity) {
                    if (whenNotFull) {
                        whenNotFull.resolve();
                        this.whenNotFullList.delete(priority);
                    }
                }
                if (priority > 0 && queue.length === 0) {
                    this.queues.delete(priority);
                    this.whenNotFullList.delete(priority);
                    this.sortedPriorities = this.sortedPriorities.filter((p) => p !== priority);
                }
                return item;
            }
        }

        await this.whenNotEmpty.promise;
        if (!this.closed) {
            this.whenNotEmpty = new Future();
        }

        return this.dequeue();
    }

    public get length(): number {
        return this.total_count;
    }

    public close(): void {
        this.closed = true;
        if (this.whenNotEmpty) {
            this.whenNotEmpty.resolve();
        }
        for (const whenNotFull of this.whenNotFullList.values()) {
            if (whenNotFull) {
                whenNotFull.resolve();
            }
        }
    }

    public async *iterate(): AsyncIterableIterator<T> {
        while (true) {
            try {
                yield await this.dequeue();
            } catch (e) {
                break;
            }
        }
    }
}
