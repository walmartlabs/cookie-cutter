/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { batch } from "../../../internal/batching/helper";
import { iterate } from "../../../utils";

describe("batch", () => {
    it("creates one big batch if allowed", () => {
        const input = [{ key: "A", data: [1, 2, 3] }, { key: "B", data: [4, 5, 6] }];

        const actual = Array.from(batch(input, (i) => iterate(i.data), () => true, 100));
        expect(actual).toMatchObject([{ completed: input, batch: [1, 2, 3, 4, 5, 6] }]);
    });

    it("doesn't break containers", () => {
        const input = [
            { key: "A", data: [1, 2, 3] },
            { key: "B", data: [4, 5, 6] },
            { key: "C", data: [7, 8, 9] },
        ];

        const actual = Array.from(batch(input, (i) => iterate(i.data), () => true, 7));
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

        const actual = Array.from(batch(input, (i) => iterate(i.data), () => true, 2));
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

        const actual = Array.from(batch(input, (i) => iterate(i.data), (p, c) => p === c));
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

        const actual = Array.from(batch(input, (i) => iterate(i.data), (p, c) => p === c, 2));
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
