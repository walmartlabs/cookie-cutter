/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import {
    IComponentContext,
    IDisposable,
    IMessage,
    IRequireInitialization,
    IState,
    IStateAggregationSource,
    IStateAggregator,
    IStateProvider,
    IStateType,
    Lifecycle,
    makeLifecycle,
    StateRef,
} from "../model";
import { ConventionBasedStateAggregator } from "./ConventionBasedStateAggregator";

export class EventSourcedStateProvider<TState extends IState<TSnapshot>, TSnapshot>
    implements IStateProvider<TState>, IRequireInitialization, IDisposable
{
    private readonly aggregator: IStateAggregator<TState, TSnapshot>;
    private readonly source: Lifecycle<IStateAggregationSource<TSnapshot>>;

    constructor(
        TState: IStateType<TState, TSnapshot>,
        aggregator: any,
        source: IStateAggregationSource<TSnapshot>
    ) {
        this.source = makeLifecycle(source);
        this.aggregator = new ConventionBasedStateAggregator(TState, aggregator);
    }

    public async initialize(context: IComponentContext) {
        await this.source.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.source.dispose();
    }

    public async get(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<StateRef<TState>> {
        const data = await this.source.load(spanContext, key, atSn);
        const state = this.aggregator.aggregate(data);
        return new StateRef<TState>(state, key, data.lastSn);
    }

    public compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState> {
        const newState = this.aggregator.aggregate({
            events,
            lastSn: stateRef.seqNum + events.length,
            snapshot: stateRef.state.snap(),
        });

        return new StateRef<TState>(newState, stateRef.key, stateRef.seqNum + events.length);
    }
}
