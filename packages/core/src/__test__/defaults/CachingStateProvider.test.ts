/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { cached, IStateProvider, sleep, StateRef } from "../..";
import { IStateCacheLifecycle } from "../../model";

class TestState {
    public total: number;

    constructor(snap?: any) {
        this.total = snap !== undefined ? snap.total : 0;
    }

    public snap(): any {
        return { total: this.total };
    }
}

describe("CachingStateProvider", () => {
    it("caches by key", async () => {
        const underlying: IStateProvider<TestState> = {
            get: jest.fn().mockImplementation((key) => {
                return new StateRef(new TestState(), key, 1);
            }),
            compute: jest.fn(),
        };

        const cache = cached(TestState, underlying);
        await cache.get(undefined, "key1");
        await cache.get(undefined, "key2");
        await cache.get(undefined, "key1");

        expect(underlying.get).toHaveBeenCalledWith(undefined, "key1", undefined);
        expect(underlying.get).toHaveBeenCalledWith(undefined, "key2", undefined);
        expect(underlying.get).toHaveBeenCalledTimes(2);
    });

    it("updates state and caches new state", async () => {
        const underlying: IStateProvider<TestState> & IStateCacheLifecycle<TestState> = {
            get: jest.fn().mockImplementationOnce((key) => {
                return new StateRef(new TestState(), key, 1);
            }),
            compute: jest.fn((stateRef: StateRef<TestState>) => {
                return new StateRef<TestState>(
                    new TestState({ total: 1 }),
                    stateRef.key,
                    stateRef.seqNum + 1
                );
            }),
            set: jest.fn((stateRef: StateRef<TestState>) => {
                return new StateRef<TestState>(
                    new TestState({ total: stateRef.state.total }),
                    stateRef.key,
                    stateRef.seqNum
                );
            }),
            invalidate: jest.fn(),
            on: jest.fn(),
        };

        const cache = cached(TestState, underlying);
        const stateRef = await cache.get(undefined, "key1");

        const computedState = cache.compute(stateRef, []);
        cache.set(computedState);
        const newStateRef = await cache.get(undefined, "key1", 2);

        expect(newStateRef.state.total).toBe(1);
        expect(underlying.get).toHaveBeenCalledTimes(1);
    });

    it("expires cache based on ttl policy", async () => {
        let counter = 0;
        const underlying: IStateProvider<TestState> = {
            get: jest.fn().mockImplementation((key: string) => {
                return new StateRef(new TestState({ total: ++counter }), key, counter);
            }),
            compute: jest.fn(),
        };

        const cache = cached(TestState, underlying, { maxTTL: 50 });

        const stateRef1 = await cache.get(undefined, "key");
        const stateRef2 = await cache.get(undefined, "key");
        await sleep(60);
        const stateRef3 = await cache.get(undefined, "key");

        expect(stateRef1.state.total).toBe(1);
        expect(stateRef2.state.total).toBe(1);
        expect(stateRef3.state.total).toBe(2);
    });
});
