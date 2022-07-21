/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IState,
    IStateProvider,
    IStateCacheLifecycle,
    IRequireInitialization,
    IDisposable,
    StateRef,
    IMessage,
    IComponentContext,
} from "..";
import { SpanContext } from "opentracing";
import { Lifecycle, makeLifecycle } from "../model";
import { EpochManager } from "./EpochManager";

export class EpochStateProvider<TState extends IState<TSnapshot>, TSnapshot>
    implements
        IStateProvider<TState>,
        IStateCacheLifecycle<TState>,
        IRequireInitialization,
        IDisposable
{
    private readonly underlying: Lifecycle<IStateProvider<TState> & IStateCacheLifecycle<TState>>;

    public constructor(
        private readonly manager: EpochManager,
        underlying: IStateProvider<TState> & IStateCacheLifecycle<TState>
    ) {
        this.underlying = makeLifecycle(underlying);
        this.underlying.on("evicted", (item) => {
            this.manager.evict(item.key);
        });
        this.manager.on("invalidated", (key) => {
            this.underlying.invalidate(key);
        });
    }

    public async get(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<StateRef<TState>> {
        const epoch = this.manager.get(key);
        const stateRef = await this.underlying.get(spanContext, key, atSn);
        return new StateRef(stateRef.state, stateRef.key, stateRef.seqNum, stateRef.epoch ?? epoch);
    }

    public compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState> {
        const computed = this.underlying.compute(stateRef, events);
        return new StateRef(computed.state, computed.key, computed.seqNum, stateRef.epoch);
    }

    public set(stateRef: StateRef<TState>): void {
        if (this.manager.get(stateRef.key) === stateRef.epoch) {
            this.underlying.set(stateRef);
        }
    }

    public invalidate(keys: string | IterableIterator<string>): void {
        this.underlying.invalidate(keys);
    }

    public initialize(context: IComponentContext): Promise<void> {
        return this.underlying.initialize(context);
    }

    public dispose(): Promise<void> {
        return this.underlying.dispose();
    }

    public on(event: "evicted", cb: (item: StateRef<TState>) => void) {
        this.underlying.on(event, cb);
    }
}
