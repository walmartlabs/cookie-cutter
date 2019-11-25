/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { AsyncPipe } from "../..";
import { sleep } from "../../utils";

describe("AsyncPipe", () => {
    async function collect<T>(pipe: AsyncPipe<T>): Promise<T[]> {
        const data: T[] = [];
        for await (const item of pipe) {
            data.push(item);
        }

        return data;
    }

    it("receives pending value", async () => {
        const pipe = new AsyncPipe<number>();
        const p = (async () => {
            await pipe.send(1);
            await pipe.send(2);
            await pipe.send(3);
            await pipe.close();
        })();

        const actual = await collect(pipe);
        expect(actual).toMatchObject([1, 2, 3]);
        await expect(p).resolves.toBeUndefined();
    });

    it("receives deferred value", async () => {
        const pipe = new AsyncPipe<number>();
        const p = (async () => {
            await sleep(50);
            await pipe.send(1);
            await pipe.send(2);
            await pipe.send(3);
            await pipe.close();
        })();

        const actual = await collect(pipe);
        expect(actual).toMatchObject([1, 2, 3]);
        await expect(p).resolves.toBeUndefined();
    });

    it("breaks iterator with exception", async () => {
        const pipe = new AsyncPipe<number>();
        const p = (async () => {
            await sleep(50);
            await pipe.send(1);
            await pipe.send(2);
            await pipe.send(3);
            await pipe.throw(new Error("test"));
        })();

        await expect(collect(pipe)).rejects.toThrowError(/test/);
        await expect(p).resolves.toBeUndefined();
    });

    it("does not write after close", async () => {
        const pipe = new AsyncPipe<number>();

        const p = (async () => {
            await pipe.send(1);
            await pipe.send(2);
            await pipe.close();
            await pipe.send(3);
            return true;
        })();

        const actual = (async () => {
            const actual = [];
            for await (const item of pipe) {
                actual.push(item);
                await sleep(10);
            }
            return actual;
        })();

        await expect(p).rejects.toThrowError(/can't send after close/);
        await expect(actual).resolves.toMatchObject([1, 2]);
    });

    it("stays closed", async () => {
        const pipe = new AsyncPipe<number>();
        const p = (async () => {
            await pipe.send(1);
            await pipe.close();
            return true;
        })();

        await expect(pipe.next()).resolves.toMatchObject({ value: 1 });
        await expect(pipe.next()).resolves.toMatchObject({ done: true });
        await expect(pipe.next()).resolves.toMatchObject({ done: true });
        await expect(p).resolves.toBeTruthy();
    });

    it("resolves a pending send operation on close", async () => {
        const pipe = new AsyncPipe<number>();

        const s = pipe.send(1);
        await pipe.close();
        await expect(s).resolves.toBeUndefined();

        const actual = await collect(pipe);
        expect(actual).toHaveLength(0);
    });

    it("resolves a pending throw operation on close", async () => {
        const pipe = new AsyncPipe<number>();

        const t = pipe.throw(new Error("test"));
        await pipe.close();
        await expect(t).resolves.toBeTruthy();

        const actual = await collect(pipe);
        expect(actual).toHaveLength(0);
    });

    it("only allows one pending send operation", async () => {
        const pipe = new AsyncPipe<number>();

        const p1 = pipe.send(1);
        const p2 = pipe.send(2);

        await expect(p2).rejects.toThrowError(/there is already a pending send call/);
        await pipe.close();
        await expect(p1).resolves.toBeUndefined();
    });

    it("receives deferred throw", async () => {
        const pipe = new AsyncPipe<number>();

        const next = pipe.next();
        const thr = pipe.throw(new Error("test"));

        await expect(next).rejects.toThrowError(/test/);
        await expect(thr).resolves.toBeTruthy();
    });

    it("resolves throw on closed pipe", async () => {
        const pipe = new AsyncPipe<number>();
        await pipe.close();
        const thr = pipe.throw(new Error("test"));
        await expect(thr).resolves.toBeTruthy();
    });
});
