/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Application, snapshotter } from "..";
import { cached } from "../cache";
import {
    CapturingOutputSink,
    EventSourcedStateProvider,
    InMemoryStateAggregationSource,
    StaticInputSource,
} from "../defaults";
import { EventSourcedMetadata, IMessage, IStoredMessage, MessageRef } from "../model";
import { inc, TallyAggregator, TallyState } from "./tally";

describe("snapshot", () => {
    it("creates brand new snapshot", async () => {
        const result = await execute([inc(5)]);
        expect(result).toHaveLength(1);
        expect(result[0].message.payload).toMatchObject({ total: 5 });
    });

    it("applies messages to previous snapshot", async () => {
        const result = await execute([inc(5), inc(2)]);
        expect(result).toHaveLength(2);
        expect(result.map((m) => m.message.payload)).toMatchObject([{ total: 5 }, { total: 7 }]);
    });

    it("handles out of order, repeated message", async () => {
        const result = await execute([
            new MessageRef({ [EventSourcedMetadata.SequenceNumber]: 1 }, inc(5)),
            new MessageRef({ [EventSourcedMetadata.SequenceNumber]: 2 }, inc(2)),
            new MessageRef({ [EventSourcedMetadata.SequenceNumber]: 1 }, inc(5)),
        ]);
        expect(result).toHaveLength(3);
        expect(result.map((m) => m.message.payload)).toMatchObject([
            { total: 5 },
            { total: 7 },
            { total: 5 },
        ]);
    });
});

async function execute(messages: IMessage[] | MessageRef[]): Promise<IStoredMessage[]> {
    const result: IStoredMessage[] = [];
    await Application.create()
        .input()
        .add(new StaticInputSource(messages, "stream-1"))
        .done()
        .state(
            cached(
                TallyState,
                new EventSourcedStateProvider(
                    TallyState,
                    new TallyAggregator(),
                    new InMemoryStateAggregationSource(new Map())
                )
            )
        )
        .dispatch(snapshotter(TallyState, new TallyAggregator()))
        .output()
        .stored(new CapturingOutputSink(result))
        .done()
        .run();

    return result;
}
