/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IAggregableState, IMessage, IState, IStateAggregator, IStateType } from "../model";
import { prettyEventName } from "../utils";

export class ConventionBasedStateAggregator<TState extends IState<TSnapshot>, TSnapshot>
    implements IStateAggregator<TState, TSnapshot>
{
    constructor(
        private readonly TState: IStateType<TState, TSnapshot>,
        private readonly target: any
    ) {}

    public aggregate(source: IAggregableState<TSnapshot>): TState {
        const state = new this.TState(source.snapshot);
        for (const e of source.events) {
            this.apply(e, state);
        }
        return state;
    }

    private apply(event: IMessage, state: TState) {
        const type = prettyEventName(event.type);
        const name = `on${type}`;
        const func = this.target[name];
        if (func) {
            func.apply(this.target, [event.payload, state]);
        }
        return state;
    }
}
