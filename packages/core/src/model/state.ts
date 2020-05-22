/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import { IMessage } from ".";

export type IStateType<TState extends IState<TSnapshot>, TSnapshot> = new (
    snapshot?: TSnapshot
) => TState;

export interface IState<TSnapshot> {
    snap(): TSnapshot;
}

export interface IAggregableState<TSnapshot> {
    readonly snapshot?: TSnapshot;
    readonly events: IMessage[];
    readonly lastSn: number;
}

export interface IStateProvider<TState> {
    get(spanContext: SpanContext, key: string, atSn?: number): Promise<StateRef<TState>>;
    compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState>;
}

export interface IStateCacheLifecycle<TState> {
    set(stateRef: StateRef<TState>): void;
    invalidate(keys: IterableIterator<string> | string): void;
    on(event: "evicted", cb: (item: StateRef<TState>) => void);
}

export interface IStateAggregator<TState, TSnapshot> {
    aggregate(source: IAggregableState<TSnapshot>): TState;
}

export interface IStateAggregationSource<TSnapshot> {
    load(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<IAggregableState<TSnapshot>>;
}

export class StateRef<TState = any> {
    constructor(
        public readonly state: TState,
        public readonly key: string,
        public readonly seqNum: number,
        public readonly epoch?: number
    ) {}

    public get uniqueId(): string {
        return `${this.key}@${this.seqNum}`;
    }

    public get isNew(): boolean {
        return this.seqNum === 0;
    }
}
