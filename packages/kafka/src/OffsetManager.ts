/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Offsets, PartitionOffset, TopicPartitionOffsetAndMetadata } from "kafkajs";
import Long = require("long");

// partition -> offset
// Offset here is the offset of the kafka message that was last successfully
// processed for a given partition. We don't keep track of messages that were
// processed and committed vs processed and NOT committed yet and instead
// rely on KafkaConsumer to periodically commit any offsets that were added.
export type partitionOffsets = Map<number, string>;

export class OffsetManager {
    // topic -> partitionOffsets
    private _offsets: Map<string, partitionOffsets> = new Map();

    /**
     * offsetsToCommit converts our internal mapping of offsets to
     * the correct format that kafkajs expects. When a consumer first joins
     * we default to an empty string for a partition's offset until we receive
     * incoming messages for that partition and can set the offset directly.
     * Empty string offsets are filtered out.
     *
     * Our internal offset tracker will add 1 to all available offsets for a partition
     * to ensure that new consumers begin from next message immediately after the one
     * that was successfully processed and about to be committed.
     */
    public offsetsToCommit(): TopicPartitionOffsetAndMetadata[] {
        const offsets = new Array<TopicPartitionOffsetAndMetadata>();
        for (const [topic, partitionOffsets] of this._offsets.entries()) {
            for (const [partition, offset] of partitionOffsets.entries()) {
                // skip any offsets that are "" which is used as a default value when a re-balance happens
                if (offset) {
                    const updatedOffset = Long.fromValue(offset).add(1).toString();
                    offsets.push({
                        topic,
                        partition,
                        offset: updatedOffset,
                    });
                }
            }
        }
        return offsets;
    }

    public resetAddedOffsets(): void {
        this._offsets = new Map();
    }

    public addOffsets(offsets: Offsets): void {
        for (const data of offsets.topics) {
            const topic = data.topic;
            const partitions = data.partitions;
            const currentPartitionOffsets = this._offsets.get(topic);
            if (!currentPartitionOffsets) {
                const newOffsets = new Map(
                    [...partitions].map((po: PartitionOffset): [number, string] => {
                        return [po.partition, po.offset];
                    })
                );
                this._offsets.set(topic, newOffsets);
            } else {
                for (const partition of partitions) {
                    currentPartitionOffsets.set(partition.partition, partition.offset);
                }
                this._offsets.set(topic, currentPartitionOffsets);
            }
        }
    }
}
