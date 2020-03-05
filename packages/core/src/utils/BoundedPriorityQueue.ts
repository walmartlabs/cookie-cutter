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
    private whenNotFull: Future<void>;
    private sortedPriorities: number[];
    private count: number;
    private closed: boolean;

    constructor(private readonly capacity: number) {
        this.count = 0;
        this.queues = new Map();
        this.sortedPriorities = [];
        this.whenNotEmpty = new Future();
        this.whenNotFull = new Future();
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
            this.sortedPriorities.push(priority);
            this.sortedPriorities = this.sortedPriorities.sort((n1, n2) => Math.sign(n2 - n1));
        }

        if (this.count < this.capacity) {
            queue.push(item);
            if (++this.count === 1) {
                this.whenNotEmpty.resolve();
            }
            return true;
        }

        if (this.whenNotFull) {
            await this.whenNotFull.promise;
        }
        if (this.closed) {
            return false;
        }

        if (isNullOrUndefined(this.whenNotFull)) {
            this.whenNotFull = new Future();
        }
        return this.enqueue(item);
    }

    public async dequeue(): Promise<T> {
        if (this.closed && this.count === 0) {
            throw new Error("queue is closed");
        }

        for (const priority of this.sortedPriorities) {
            const queue = this.queues.get(priority)!;
            if (queue.length > 0) {
                const item = queue.shift();
                if (this.count-- === this.capacity) {
                    if (this.whenNotFull) {
                        this.whenNotFull.resolve();
                        this.whenNotFull = undefined;
                    }
                }
                if (priority > 0 && queue.length === 0) {
                    this.queues.delete(priority);
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
        return this.count;
    }

    public close(): void {
        this.closed = true;
        if (this.whenNotEmpty) {
            this.whenNotEmpty.resolve();
        }
        this.whenNotFull.resolve();
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
