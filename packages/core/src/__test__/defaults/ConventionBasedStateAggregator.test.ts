/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ConventionBasedStateAggregator } from "../..";
import { EncodedMessage, JsonMessageEncoder } from "../../defaults";
import { dec, inc } from "../tally";

interface ITestSnapshot {
    readonly total: number;
}

interface IIncrement {
    readonly count: number;
}
interface IDecrement {
    readonly count: number;
}

const INCREMENT_TYPE = "testing.Increment";
const DECREMENT_TYPE = "testing.Decrement";

class TestState {
    private sum: number;

    constructor(snapshot?: ITestSnapshot) {
        this.sum = snapshot ? snapshot.total : 0;
    }

    public get total(): number {
        return this.sum;
    }

    public increment(count: number): void {
        this.sum += count;
    }

    public decrement(count: number): void {
        this.sum -= count;
    }

    public snap(): ITestSnapshot {
        return { total: this.sum };
    }
}

class TestStateAggregator {
    public onIncrement(msg: IIncrement, state: TestState): void {
        state.increment(msg.count);
    }

    public onDecrement(msg: IDecrement, state: TestState): void {
        state.decrement(msg.count);
    }
}

describe("ConventionBasedStateAggregator", () => {
    it("aggregates events without snapshot", () => {
        const target = new TestStateAggregator();
        const aggregator = new ConventionBasedStateAggregator(TestState, target);

        const state = aggregator.aggregate({
            lastSn: 4,
            snapshot: undefined,
            events: [
                { type: INCREMENT_TYPE, payload: { count: 5 } },
                { type: INCREMENT_TYPE, payload: { count: 2 } },
                { type: DECREMENT_TYPE, payload: { count: 4 } },
                { type: INCREMENT_TYPE, payload: { count: 1 } },
            ],
        });

        expect(state.total).toBe(4);
    });

    it("aggregates events with snapshot", () => {
        const target = new TestStateAggregator();
        const aggregator = new ConventionBasedStateAggregator(TestState, target);

        const state = aggregator.aggregate({
            lastSn: 15,
            snapshot: { total: 7 },
            events: [
                { type: INCREMENT_TYPE, payload: { count: 5 } },
                { type: INCREMENT_TYPE, payload: { count: 2 } },
                { type: DECREMENT_TYPE, payload: { count: 4 } },
                { type: INCREMENT_TYPE, payload: { count: 1 } },
            ],
        });

        expect(state.total).toBe(11);
    });
    it("aggregates events that can be both handled by the aggregator or skipped if missing a handler", () => {
        const target = new TestStateAggregator();
        const encoder = new JsonMessageEncoder();
        const aggregator = new ConventionBasedStateAggregator(TestState, target);
        const invalidMsgType = "invalid.message.type";
        const invalidEncodedMsg = new Uint8Array(Buffer.from("invalid"));

        const state = aggregator.aggregate({
            lastSn: 4,
            snapshot: undefined,
            events: [
                { type: INCREMENT_TYPE, payload: { count: 5 } },
                new EncodedMessage(encoder, INCREMENT_TYPE, encoder.encode(inc(1))),
                new EncodedMessage(encoder, DECREMENT_TYPE, encoder.encode(dec(1))),
                // these two messages gets skipped as we don't have handlers for them
                new EncodedMessage(encoder, invalidMsgType, invalidEncodedMsg),
                { type: "", payload: { count: 5 } },
            ],
        });

        expect(state.total).toBe(5);
    });
});
