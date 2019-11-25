/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IMessage,
    IOutputSink,
    IOutputSinkGuarantees,
    isStoredMessage,
    IStateVerification,
    IStoredMessage,
    OutputSinkConsistencyLevel,
    SequenceConflictError,
} from "../model";

export class InMemoryStateOutputSink implements IOutputSink<IStoredMessage | IStateVerification> {
    constructor(private readonly storage: Map<string, IMessage[]>) {}

    public sink(output: IterableIterator<IStoredMessage | IStateVerification>): Promise<void> {
        const counter = new Map<string, number>();
        const updates = new Map<string, IMessage[]>();

        for (const msg of output) {
            const existing = this.storage.get(msg.state.key) || [];
            const additions = updates.get(msg.state.key) || [];

            const inc = counter.get(msg.state.uniqueId) || 0;
            if (msg.state.seqNum + inc !== existing.length + additions.length) {
                throw new SequenceConflictError({
                    key: msg.state.key,
                    newSn: msg.state.seqNum + inc,
                    expectedSn: msg.state.seqNum + inc,
                    actualSn: existing.length + additions.length,
                });
            }

            if (isStoredMessage(msg)) {
                additions.push(msg.message);
                counter.set(msg.state.uniqueId, inc + 1);
                updates.set(msg.state.key, additions);
            }
        }

        for (const entry of updates.entries()) {
            const existing = this.storage.get(entry[0]) || [];
            existing.push(...entry[1]);
            this.storage.set(entry[0], existing);
        }

        return Promise.resolve();
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.Atomic,
            idempotent: false,
        };
    }
}
