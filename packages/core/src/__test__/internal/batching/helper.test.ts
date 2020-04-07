/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    batch,
    filterByEpoch,
    filterNonLinearStateChanges,
} from "../../../internal/batching/helper";
import { iterate } from "../../../utils";
import { StateRef, SequenceConflictError } from "../../../model";
import { EpochManager } from "../../../internal";

describe("batch", () => {
    it("creates one big batch if allowed", () => {
        const input = [
            { key: "A", data: [1, 2, 3] },
            { key: "B", data: [4, 5, 6] },
        ];

        const actual = Array.from(
            batch(
                input,
                (i) => iterate(i.data),
                () => true,
                100
            )
        );
        expect(actual).toMatchObject([{ completed: input, batch: [1, 2, 3, 4, 5, 6] }]);
    });

    it("doesn't break containers", () => {
        const input = [
            { key: "A", data: [1, 2, 3] },
            { key: "B", data: [4, 5, 6] },
            { key: "C", data: [7, 8, 9] },
        ];

        const actual = Array.from(
            batch(
                input,
                (i) => iterate(i.data),
                () => true,
                7
            )
        );
        expect(actual).toMatchObject([
            { completed: [input[0], input[1]], batch: [1, 2, 3, 4, 5, 6] },
            { completed: [input[2]], batch: [7, 8, 9] },
        ]);
    });

    it("breaks containers if required by batch size", () => {
        const input = [
            { key: "A", data: [1, 2, 3] },
            { key: "B", data: [4, 5, 6] },
            { key: "C", data: [7, 8, 9] },
        ];

        const actual = Array.from(
            batch(
                input,
                (i) => iterate(i.data),
                () => true,
                2
            )
        );
        expect(actual).toMatchObject([
            { completed: [], batch: [1, 2] },
            { completed: [input[0]], batch: [3] },
            { completed: [], batch: [4, 5] },
            { completed: [input[1]], batch: [6] },
            { completed: [], batch: [7, 8] },
            { completed: [input[2]], batch: [9] },
        ]);
    });

    it("groups by specified func", () => {
        const input = [
            { key: "A", data: [1, 7, 1] },
            { key: "B", data: [2, 2, 2] },
            { key: "C", data: [3, 3, 3] },
        ];

        const actual = Array.from(
            batch(
                input,
                (i) => iterate(i.data),
                (p, c) => p === c
            )
        );
        expect(actual).toMatchObject([
            { completed: [], batch: [1] },
            { completed: [], batch: [7] },
            { completed: [input[0]], batch: [1] },
            { completed: [input[1]], batch: [2, 2, 2] },
            { completed: [input[2]], batch: [3, 3, 3] },
        ]);
    });

    it("groups by specified func with limited batch size", () => {
        const input = [
            { key: "A", data: [1, 1, 1] },
            { key: "B", data: [2, 2, 2] },
            { key: "C", data: [3, 3, 3] },
        ];

        const actual = Array.from(
            batch(
                input,
                (i) => iterate(i.data),
                (p, c) => p === c,
                2
            )
        );
        expect(actual).toMatchObject([
            { completed: [], batch: [1, 1] },
            { completed: [input[0]], batch: [1] },
            { completed: [], batch: [2, 2] },
            { completed: [input[1]], batch: [2] },
            { completed: [], batch: [3, 3] },
            { completed: [input[2]], batch: [3] },
        ]);
    });
});

describe("epoch mismatches", () => {
    interface IOutput {
        state: StateRef;
    }

    it("splits batch at first mismatch", () => {
        const outputs: IOutput[] = [
            { state: new StateRef(undefined, "key-1", 1, 3) }, // good (epoch = 3 is latest)
            { state: new StateRef(undefined, "key-1", 2, 3) }, // good (epoch = 3 is latest)
            { state: new StateRef(undefined, "key-1", 3, 2) }, // bad  (epoch = 2 is outdated)
            { state: new StateRef(undefined, "key-1", 3, 3) }, // bad, because previous was bad
        ];

        const epochs = new EpochManager();
        epochs.invalidate("key-1"); // epoch is 2 now
        epochs.invalidate("key-1"); // epoch is 3 now

        const result = filterByEpoch(outputs, (o) => [o.state], epochs);
        expect(result.successful).toMatchObject(outputs.slice(0, 2));
        expect(result.failed).toMatchObject(outputs.slice(2));
        expect(result.error.error).toMatchObject(
            new SequenceConflictError({
                key: "key-1",
                actualSn: 3,
                expectedSn: 3,
                newSn: 3,
                actualEpoch: 2,
                expectedEpoch: 3,
            })
        );
    });
});

describe("non-linear state", () => {
    interface IOutput {
        seq: number;
        states: StateRef[];
    }

    it("detects conflicting state updates", () => {
        const outputs: IOutput[] = [
            // two calls to ctx.store with the same stateRef
            // from the same message handler is OK
            {
                seq: 1,
                states: [
                    new StateRef(undefined, "key-1", 1, 1),
                    new StateRef(undefined, "key-1", 1, 1),
                ],
            },

            // this is OK as it's based on the previous state
            { seq: 5, states: [new StateRef(undefined, "key-1", 3, 1)] },

            // two calls to ctx.store with the same stateRef
            // from different message handlers is not OK
            // ... one of the two can be considered OK though (the first one)
            { seq: 2, states: [new StateRef(undefined, "key-1", 4, 1)] },
            { seq: 3, states: [new StateRef(undefined, "key-1", 4, 1)] },

            // this is not OK, because it is based on something that was not OK
            { seq: 4, states: [new StateRef(undefined, "key-1", 5, 1)] },
        ];

        const result = filterNonLinearStateChanges(outputs, (o) => [o.seq, o.states]);
        expect(result.successful).toMatchObject(outputs.slice(0, 3));
        expect(result.failed).toMatchObject(outputs.slice(3));
    });
});
