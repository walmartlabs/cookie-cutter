/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { MaterializedViewStateProvider } from "./MaterializedViewStateProvider";
import { IState, StateRef, IStateType } from "../model";
import { SpanContext } from "opentracing";

export class InMemoryMaterializedViewStateProvider<
    TState extends IState<TSnapshot>,
    TSnapshot
> extends MaterializedViewStateProvider<TState, TSnapshot> {
    public constructor(
        TState: IStateType<TState, TSnapshot>,
        private readonly storage: Map<string, { seqNum: number; data: TSnapshot }>
    ) {
        super(TState);
    }

    public get(_: SpanContext, key: string): Promise<StateRef<TState>> {
        const { seqNum, data } = this.storage.get(key) || { seqNum: 0, data: undefined };
        return Promise.resolve(new StateRef(new this.TState(data), key, seqNum));
    }
}
