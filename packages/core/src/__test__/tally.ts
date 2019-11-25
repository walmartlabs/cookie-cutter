/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage } from "../model";

export class Increment {
    constructor(public count: number) {}
}

export class Decrement {
    constructor(public count: number) {}
}

export class TallyState {
    public total: number;

    constructor(snapshot?: ITallyStateSnapshot) {
        this.total = snapshot ? snapshot.total : 0;
    }

    public snap(): ITallyStateSnapshot {
        return { total: this.total };
    }
}

export interface ITallyStateSnapshot {
    readonly total: number;
}

export class TallyAggregator {
    public onIncrement(msg: Increment, state: TallyState): void {
        state.total += msg.count;
    }

    public onDecrement(msg: Increment, state: TallyState): void {
        state.total -= msg.count;
    }
}

export function inc(count: number): IMessage {
    return {
        type: Increment.name,
        payload: new Increment(count),
    };
}

export function dec(count: number): IMessage {
    return {
        type: Decrement.name,
        payload: new Decrement(count),
    };
}
