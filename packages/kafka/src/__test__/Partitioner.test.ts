/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as murmurhash from "murmurhash";
import { createPartitioner, toPositive } from "../Partitioner";

describe("partitioner", () => {
    describe("#createPartitioner", () => {
        it("should handle a partition of type string", () => {
            const partitioner = createPartitioner();
            const options = { partitionMetadata: [{}, {}, {}], message: { partition: "foo" } };
            const partition = partitioner(options);
            expect(partition).toEqual(
                toPositive(murmurhash.v2(options.message.partition)) %
                    options.partitionMetadata.length
            );
        });

        it("should accept a numeric partition", () => {
            const partitioner = createPartitioner();
            const options = { partitionMetadata: [{}, {}], message: { partition: 999 } };

            expect(partitioner(options)).toEqual(999);
        });

        it("should use the partition id of a partition with leader >= 0", () => {
            const partitioner = createPartitioner();
            const options = {
                partitionMetadata: [
                    { partitionId: 999, leader: 0 },
                    { partitionId: 1, leader: -1 },
                ],
                message: {},
            };

            expect(partitioner(options)).toEqual(999);
        });

        it("should work with key values that are buffers", () => {
            const partitioner = createPartitioner();
            const options = { partitionMetadata: [{}, {}], message: { key: Buffer.from("test") } };

            expect(partitioner(options)).toEqual(0);
        });
    });
});
