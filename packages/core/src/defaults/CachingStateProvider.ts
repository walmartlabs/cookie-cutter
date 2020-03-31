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
    private readonly callbacks: Set<(item: StateRef<TState>) => void>;
    private callbacksEnabled: boolean;

    constructor(
        private TState: IClassType<TState>,
        underlying: IStateProvider<TState>,
        options: ICacheOptions
    ) {
        this.callbacks = new Set();
        this.callbacksEnabled = true;
        this.cache = new LRU({
            max: options.maxSize || 1000,
            maxAge: options.maxTTL,
            noDisposeOnSet: true,
            dispose: (_, val) => {
                if (this.callbacksEnabled) {
                    for (const cb of this.callbacks.values()) {
                        cb(val);
                    }
                }
            },
        });
        this.underlying = makeLifecycle(underlying);
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
        if (!stateRef || (atSn !== undefined && stateRef.seqNum !== atSn)) {
            stateRef = await this.underlying.get(spanContext, key, atSn);
            this.cache.set(key, stateRef);
        }

        const clone = new this.TState(stateRef.state.snap());
        return new StateRef(clone, key, stateRef.seqNum);
    }

    public invalidate(keys: IterableIterator<string> | string): void {
        this.callbacksEnabled = false;
        try {
            if (isString(keys)) {
                this.cache.del(keys);
            } else {
                for (const key of keys) {
                    this.cache.del(key);
                }
            }
        } finally {
            this.callbacksEnabled = true;
        }
    }

    public set(stateRef: StateRef<TState>): void {
        const cached = this.cache.get(stateRef.key);
        if (!cached || cached.seqNum < stateRef.seqNum) {
            this.cache.set(stateRef.key, stateRef);
        }
    }

    public compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState> {
        return this.underlying.compute(stateRef, events);
    }

    public on(_: "evicted", cb: (item: StateRef<TState>) => void) {
        this.callbacks.add(cb);
    }
}
