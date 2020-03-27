/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as LRU from "lru-cache";
import { SpanContext } from "opentracing";
import { isString } from "util";
import { ICacheOptions } from "..";
import {
    IClassType,
    IComponentContext,
    IDisposable,
    IMessage,
    IRequireInitialization,
    IState,
    IStateCacheLifecycle,
    IStateProvider,
    Lifecycle,
    makeLifecycle,
    StateRef,
} from "../model";

export class CachingStateProvider<TState extends IState<TSnapshot>, TSnapshot>
    implements
        IStateProvider<TState>,
        IStateCacheLifecycle<TState>,
        IRequireInitialization,
        IDisposable {
    private readonly cache: LRU<string, StateRef<TState>>;
    private readonly underlying: Lifecycle<IStateProvider<TState>>;
    public epochCache: Map<string, number>;
    private useEpochs: boolean;

    constructor(
        private TState: IClassType<TState>,
        underlying: IStateProvider<TState>,
        options: ICacheOptions
    ) {
        this.cache = new LRU({
            max: options.maxSize || 1000,
            maxAge: options.maxTTL,
        });
        this.underlying = makeLifecycle(underlying);
        this.epochCache = new Map<string, number>();
        this.useEpochs = false;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.underlying.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.underlying.dispose();
    }

    public async get(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<StateRef<TState>> {
        let stateRef = this.cache.get(key);
        let cachedEpoch = -1;
        if (this.useEpochs) {
            cachedEpoch = this.epochCache.get(key);
            if (cachedEpoch === undefined) {
                this.epochCache.set(key, 0);
                cachedEpoch = 0;
            }
        }
        if (!stateRef) {
            stateRef = await this.underlying.get(spanContext, key, atSn);
            const cached = this.cache.get(key);
            if (cached && cached.seqNum > stateRef.seqNum) {
                stateRef = cached;
            } else {
                if (this.useEpochs) {
                    cachedEpoch++;
                    this.epochCache.set(key, cachedEpoch);
                    stateRef.epoch = cachedEpoch;
                }
                this.cache.set(key, stateRef);
            }
        } else if (stateRef && atSn !== undefined && stateRef.seqNum !== atSn) {
            stateRef = await this.underlying.get(spanContext, key, atSn);
            if (this.useEpochs) {
                cachedEpoch++;
                this.epochCache.set(key, cachedEpoch);
                stateRef.epoch = cachedEpoch;
            }
            this.cache.set(key, stateRef);
        }

        const clone = new this.TState((stateRef.state as any).snap());
        return new StateRef(clone, key, stateRef.seqNum, stateRef.epoch);
    }

    public invalidate(keys: IterableIterator<string> | string, epochs?: Map<string, number>): void {
        if (isString(keys)) {
            if (this.useEpochs) {
                const cached = this.cache.get(keys);
                if (cached) {
                    const epoch = epochs ? epochs.get(keys) : -1;
                    if (cached.epoch > epoch) {
                        return;
                    }
                }
            }
            this.cache.del(keys);
        } else {
            for (const key of keys) {
                if (this.useEpochs) {
                    const cached = this.cache.get(key);
                    if (cached) {
                        const epoch = epochs ? epochs.get(key) : -1;
                        if (cached.epoch > epoch) {
                            continue;
                        }
                    }
                }
                this.cache.del(key);
            }
        }
    }

    public set(stateRef: StateRef<TState>): void {
        const cached = this.cache.get(stateRef.key);
        if (!cached) {
            this.cache.set(stateRef.key, stateRef);
        } else {
            if (
                cached.seqNum < stateRef.seqNum &&
                (!this.useEpochs || cached.epoch === stateRef.epoch)
            ) {
                this.cache.set(stateRef.key, stateRef);
            }
        }
    }

    public compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState> {
        return this.underlying.compute(stateRef, events);
    }

    public enableEpochs() {
        this.useEpochs = true;
    }
}
