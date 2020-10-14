/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BoundedPriorityQueue } from "../../";
import { timeout } from "../../utils";

describe("BoundedPriorityQueue", () => {
    it("enforces capacity per queue priority", async () => {
        const queue = new BoundedPriorityQueue<number>(2);
        await expect(queue.enqueue(1)).resolves.toBe(true);
        await expect(queue.enqueue(2)).resolves.toBe(true);
        await expect(queue.enqueue(3, 1)).resolves.toBe(true);
        await expect(queue.enqueue(4, 1)).resolves.toBe(true);
        await expect(queue.enqueue(5, 2)).resolves.toBe(true);
        await expect(queue.enqueue(6, 2)).resolves.toBe(true);
        await expect(timeout(queue.enqueue(7), 50)).rejects.toBeDefined();
        await expect(timeout(queue.enqueue(8, 1), 50)).rejects.toBeDefined();
        await expect(timeout(queue.enqueue(9, 2), 50)).rejects.toBeDefined();
    });

    it("blocks adding when capacity is reached", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        await expect(queue.enqueue(1)).resolves.toBe(true);
        await expect(queue.enqueue(2)).resolves.toBe(true);
        await expect(queue.enqueue(3)).resolves.toBe(true);
        await expect(timeout(queue.enqueue(4), 50)).rejects.toBeDefined();
    });

    it("blocks dequeue when empty", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        await expect(timeout(queue.dequeue(), 50)).rejects.toBeDefined();
    });

    it("resolves dequeue after item was added", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        const pendingDequeue = queue.dequeue();
        await queue.enqueue(42);
        await expect(pendingDequeue).resolves.toBe(42);
    });

    it("performs blocked enqueue operation after item was dequeued", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        await queue.enqueue(1);
        await queue.enqueue(2);
        await queue.enqueue(3);
        const pendingEnqueue = queue.enqueue(4);

        for (let expected = 1; expected <= 4; expected++) {
            await expect(queue.dequeue()).resolves.toBe(expected);
        }

        await expect(pendingEnqueue).resolves.toBe(true);
    });

    it("fails blocked enqueue/dequeue on close", async () => {
        const queue = new BoundedPriorityQueue<number>(0);
        const pendingDequeue = queue.dequeue();
        const pendingEnqueue = queue.enqueue(1);
        queue.close();
        await expect(pendingDequeue).rejects.toBeTruthy();
        await expect(pendingEnqueue).resolves.toBe(false);
    });

    it("dequeues items with higher priority first", async () => {
        const queue = new BoundedPriorityQueue<number>(2);
        await queue.enqueue(1, 0);
        await queue.enqueue(3, 1);
        await queue.enqueue(5, 2);
        await queue.enqueue(2, 0);
        await queue.enqueue(4, 1);
        await queue.enqueue(6, 2);
        queue.close();

        const buffer = [];
        for await (const item of queue.iterate()) {
            buffer.push(item);
        }

        expect(buffer).toMatchObject([5, 6, 3, 4, 1, 2]);
    });

    it("iterates contained items", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        await queue.enqueue(1, 0);
        await queue.enqueue(2, 1);
        await queue.enqueue(3, 0);
        queue.close();

        const buffer = [];
        for await (const item of queue.iterate()) {
            buffer.push(item);
        }

        expect(buffer).toMatchObject([2, 1, 3]);
    });

    it("terminates iterator if no items have been produced", async () => {
        const queue = new BoundedPriorityQueue<number>(3);
        const p = (async () => {
            for await (const _ of queue.iterate()) {
                // nothing
            }
            return "done";
        })();
        queue.close();
        await expect(p).resolves.toBe("done");
    });

    it("supports multiple concurrent writers", async () => {
        const queue = new BoundedPriorityQueue<number>(1);

        const enqueuePromises: Promise<boolean>[] = [];
        for (let i = 1; i < 11; i++) {
            if (i === 10) {
                queue
                    .enqueue(i)
                    .then(() => {
                        queue.close();
                    })
                    .catch();
                continue;
            }
            enqueuePromises.push(queue.enqueue(i));
        }

        const buffer = [];
        for await (const item of queue.iterate()) {
            buffer.push(item);
        }

        await Promise.all(enqueuePromises);
        expect(buffer).toMatchObject([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("closes queue immediately after it becomes empty", async () => {
        const queue = new BoundedPriorityQueue<number>(1);
        const enqueuePromise = queue.enqueue(1);
        const dequeuePromise = queue.dequeue();
        expect(() => queue.close()).not.toThrowError();
        await enqueuePromise;
        await dequeuePromise;
    });

    it("keeps priority through subsequent attempts to enqueue", async () => {
        const queue = new BoundedPriorityQueue<number>(1);
        await queue.enqueue(1, 0);
        await queue.enqueue(2, 1);
        // tslint:disable-next-line:no-floating-promises
        queue.enqueue(3, 1);
        // tslint:disable-next-line:no-floating-promises
        queue.enqueue(4, 1);

        const buffer = [];
        for await (const item of queue.iterate()) {
            buffer.push(item);
            if (buffer.length === 4) {
                queue.close();
            }
        }

        expect(buffer).toMatchObject([2, 3, 4, 1]);
    });
});
