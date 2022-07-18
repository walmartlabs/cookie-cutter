/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import { IMessage, IState, IStateProvider, IStateType, StateRef } from "../model";

export abstract class MaterializedViewStateProvider<TState extends IState<TSnapshot>, TSnapshot>
    implements IStateProvider<TState>
{
    constructor(protected readonly TState: IStateType<TState, TSnapshot>) {}

    public abstract get(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<StateRef<TState>>;

    public compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState> {
        if (events.length === 0) {
            return new StateRef(
                new this.TState(stateRef.state.snap()),
                stateRef.key,
                stateRef.seqNum
            );
        }

        return new StateRef(
            new this.TState(events[events.length - 1].payload as TSnapshot),
            stateRef.key,
            stateRef.seqNum + events.length
        );
    }
}
