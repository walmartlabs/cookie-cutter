/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    EventSourcedMetadata,
    IDispatchContext,
    IMessage,
    MessageRef,
} from "../../src";
import {
    mockMaterializedState,
    mockState,
    msg,
    runIntegrationTest,
    truncateOutputBeacon,
} from "../testing";

class TestClass {
    constructor(public readonly field: string) {}
}

export class CommandHandler {
    public onTestClass(msg: TestClass, ctx: IDispatchContext): void {
        ctx.publish(
            TestClass,
            new TestClass(msg.field + " " + ctx.metadata<string>(EventSourcedMetadata.EventType))
        );
    }
}

describe("runIntegrationTest and msg(...)", () => {
    it("sends a mix of IMessage and MessageRefs to message handler", async () => {
        const values: string[] = ["val_0", "val_1", "val_2", "val_3"];
        const overwritingEventType = "TestClassEvent";
        const metadata = {};
        metadata[EventSourcedMetadata.EventType] = overwritingEventType;

        const input: (IMessage | MessageRef)[] = [
            msg(TestClass, { field: values[0] }),
            msg(TestClass, { field: values[1] }, metadata),
            msg(TestClass, { field: values[2] }),
            msg(TestClass, { field: values[3] }, metadata),
        ];

        const app = Application.create().dispatch(new CommandHandler());
        const output = await runIntegrationTest(app, input);

        expect(output.published).toHaveLength(4);
        expect(output.stored).toHaveLength(0);
        expect(output.outputs).toHaveLength(4);
        expect(output.published[0].message).toMatchObject(
            msg(TestClass, new TestClass(values[0] + " " + TestClass.name))
        );
        expect(output.published[1].message).toMatchObject(
            msg(TestClass, new TestClass(values[1] + " " + overwritingEventType))
        );
        expect(output.published[2].message).toMatchObject(
            msg(TestClass, new TestClass(values[2] + " " + TestClass.name))
        );
        expect(output.published[3].message).toMatchObject(
            msg(TestClass, new TestClass(values[3] + " " + overwritingEventType))
        );
    });

    it("truncates output with truncateOutputBeacon", async () => {
        const input: (IMessage | MessageRef)[] = [
            msg(TestClass, { field: "A" }),
            truncateOutputBeacon(),
            msg(TestClass, { field: "B" }),
        ];

        const app = Application.create().dispatch(new CommandHandler());
        const output = await runIntegrationTest(app, input);
        expect(output.published).toHaveLength(1);
        expect(output.published[0].message.payload).toMatchObject({
            field: "B TestClass",
        });
    });
});

class State {
    public total: number = 0;
    public constructor(snapshot?: any) {
        if (snapshot) {
            this.total = snapshot.total;
        }
    }

    public snap(): any {
        return { total: this.total };
    }
}

describe("mockState", () => {
    class Event {
        constructor(public readonly count: number) {}
    }

    class StateAggregator {
        public onEvent(msg: Event, state: State) {
            state.total += msg.count;
        }
    }

    it("resolves for any key if IMessage[] is passed", async () => {
        const state = mockState(State, new StateAggregator(), [
            msg(Event, new Event(2)),
            msg(Event, new Event(5)),
        ]);

        const abc = await state.get(undefined, "abc");
        const xyz = await state.get(undefined, "xyz");
        expect(abc.state).toMatchObject({ total: 7 });
        expect(xyz.state).toMatchObject({ total: 7 });
    });

    it("resolves for specific key if object is passed", async () => {
        const state = mockState(State, new StateAggregator(), {
            ["stream-1"]: [msg(Event, new Event(2)), msg(Event, new Event(5))],
            ["stream-2"]: [msg(Event, new Event(1)), msg(Event, new Event(1))],
        });

        const stream1 = await state.get(undefined, "stream-1");
        const stream2 = await state.get(undefined, "stream-2");
        const xyz = await state.get(undefined, "xyz");
        expect(stream1.state).toMatchObject({ total: 7 });
        expect(stream2.state).toMatchObject({ total: 2 });
        expect(xyz.state).toMatchObject({ total: 0 });
    });
});

describe("mockMaterializedState", () => {
    it("works for get()", async () => {
        const mock = mockMaterializedState<State>(State, {
            "key-1": new State({ total: 10 }),
            "key-2": new State({ total: 11 }),
        });
        const o1 = await mock.get(undefined, "key-1");
        expect(o1.state.snap().total).toEqual(10);

        const o2 = await mock.get(undefined, "key-2");
        expect(o2.state.snap().total).toEqual(11);

        const bogus = await mock.get(undefined, "bogus");
        expect(bogus.isNew).toBeTruthy();
        expect(bogus.state).toEqual(new State());
    });
});
