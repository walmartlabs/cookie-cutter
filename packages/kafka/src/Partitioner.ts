/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as crypto from "crypto";
import * as murmurhash from "murmurhash";

export function toPositive(x) {
    // tslint:disable-next-line:no-bitwise
    return x & 0x7fffffff;
}

/**
 * Customer "createPartitioner" implementation for KafkaJS.
 * Line for line copy of the default implementation in KafkaJS,
 * with a small addition to handle a `message.partition` type of
 * "string".
 */
export function createPartitioner() {
    let counter = crypto.randomBytes(32).readUInt32BE(0);

    return ({ partitionMetadata, message }) => {
        const numPartitions = partitionMetadata.length;
        const availablePartitions = partitionMetadata.filter((p) => p.leader >= 0);
        const numAvailablePartitions = availablePartitions.length;

        /** Added: Allows us to pass partition keys that are strings */
        if (typeof message.partition === "string") {
            return toPositive(murmurhash.v2(message.partition)) % numPartitions;
        }
        /** End Added */

        if (message.partition !== null && message.partition !== undefined) {
            return message.partition;
        }

        if (message.key !== null && message.key !== undefined) {
            const key = Buffer.isBuffer(message.key) ? message.key.toString() : message.key;
            return toPositive(murmurhash.v2(key)) % numPartitions;
        }

        if (numAvailablePartitions > 0) {
            const i = toPositive(++counter) % numAvailablePartitions;
            return availablePartitions[i].partitionId;
        }

        // no partitions are available, give a non-available partition
        return toPositive(++counter) % numPartitions;
    };
}
