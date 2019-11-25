import { roundRobinIterators } from "../../../src/internal/helpers";

async function* iterator<T>(items: T[]): AsyncIterableIterator<T> {
    for (const n of items) {
        yield n;
    }
}

describe("roundRobinIterators", () => {
    it("emits messages from iterators until all are drained", async () => {
        const values1 = [1, 2, 3, 4, 5];
        const values2 = [10, 20, 30, 40, 50];
        const it1 = iterator(values1);
        const it2 = iterator(values2);

        const all = [];
        for await (const n of roundRobinIterators([it1, it2])) {
            all.push(n);
        }

        for (const n of values1.concat(values2)) {
            expect(all).toContain(n);
        }
    });
});
