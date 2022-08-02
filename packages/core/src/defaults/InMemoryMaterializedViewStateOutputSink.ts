/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IOutputSink,
    IOutputSinkGuarantees,
    isStoredMessage,
    IStateVerification,
    IStoredMessage,
    OutputSinkConsistencyLevel,
    SequenceConflictError,
} from "../model";

export class InMemoryMaterializedViewStateOutputSink<TSnapshot>
    implements IOutputSink<IStoredMessage | IStateVerification>
{
    constructor(private readonly storage: Map<string, { seqNum: number; data: TSnapshot }>) {}

    public sink(output: IterableIterator<IStoredMessage | IStateVerification>): Promise<void> {
        const counter = new Map<string, number>();
        const updates = new Map<string, TSnapshot[]>();

        for (const msg of output) {
            let existing = this.storage.get(msg.state.key);
            if (!existing) {
                this.storage.set(msg.state.key, (existing = { seqNum: 0, data: undefined }));
            }
            const additions = updates.get(msg.state.key) || [];

            const inc = counter.get(msg.state.uniqueId) || 0;
            if (msg.state.seqNum !== existing.seqNum + additions.length) {
                throw new SequenceConflictError({
                    key: msg.state.key,
                    newSn: msg.state.seqNum + inc,
                    expectedSn: msg.state.seqNum + inc,
                    actualSn: existing.seqNum + additions.length,
                });
            }

            if (isStoredMessage(msg)) {
                additions.push(msg.message.payload);
                counter.set(msg.state.uniqueId, inc + 1);
                updates.set(msg.state.key, additions);
            }
        }

        for (const entry of updates.entries()) {
            const existing = this.storage.get(entry[0]);
            existing.seqNum += entry[1].length;
            existing.data = entry[1][entry[1].length - 1];
        }

        return Promise.resolve();
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.Atomic,
            idempotent: true,
        };
    }
}
