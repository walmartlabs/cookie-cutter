/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { EpochManager } from "../../internal";
import { IMessage } from "../../model";
import {
    EventSourcedStateProvider,
    InMemoryStateAggregationSource,
    CachingStateProvider,
} from "../../defaults";
import { TallyState, TallyAggregator, Increment } from "../tally";
import { EpochStateProvider } from "../../internal/EpochStateProvider";

describe("EpochStateProvider", () => {
    const cacheFactory = () => {
        const epochs = new EpochManager();
        const storage = new Map<string, IMessage[]>();
        const cache = new EpochStateProvider(
            epochs,
            new CachingStateProvider(
                TallyState,
                new EventSourcedStateProvider(
                    TallyState,
                    new TallyAggregator(),
                    new InMemoryStateAggregationSource(storage)
                ),
                { maxSize: 10 }
            )
        );

        return { epochs, storage, cache };
    };

    it("returns StateRefs with epochs", async () => {
        const { cache } = cacheFactory();
        const stateRef = await cache.get(undefined, "key-1");
        expect(stateRef.epoch).toBe(1);
    });

    it("increments epoch when epoch is invalidated", async () => {
        const { cache, storage, epochs } = cacheFactory();
        storage.set("key-1", [{ type: Increment.name, payload: new Increment(1) }]);

        await cache.get(undefined, "key-1");
        epochs.invalidate("key-1");
        const stateRef = await cache.get(undefined, "key-1");
        expect(stateRef.epoch).toBe(2);
    });

    it("resets epoch counter when item is evicted from cache", async () => {
        const { cache, storage, epochs } = cacheFactory();
        for (let i = 0; i < 100; i++) {
            storage.set(`key-${i}`, [{ type: Increment.name, payload: new Increment(1) }]);
        }

        for (let i = 0; i < 100; i++) {
            await cache.get(undefined, `key-${i}`); // cache miss
            epochs.invalidate(`key-${i}`); // evict from cache, cache size remains 1, epoch incremented to 2
        }

        for (let i = 0; i < 100; i++) {
            await cache.get(undefined, `key-${i}`); // cache miss, loop will fill up cache
        }

        // cache has a capacity of 10 ... after the loop above
        // there should be items 90-99 in the cache
        const stateRef = await cache.get(undefined, "key-1");
        expect(stateRef.epoch).toBe(1); // epoch was reset to 1, because key-1 was evicted from the cache based on LRU
    });
});
