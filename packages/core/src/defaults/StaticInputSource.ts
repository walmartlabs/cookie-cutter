/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { EventSourcedMetadata, IInputSource, IMessage, MessageRef } from "..";

export type StaticInputSourceType<T> = AsyncIterableIterator<T> | IterableIterator<T> | T[];

export class StaticInputSource implements IInputSource {
    private done: boolean;
    public readonly responses = [];

    constructor(
        private readonly input: StaticInputSourceType<IMessage | MessageRef>,
        private readonly stream?: string,
        private readonly captureResponses?: boolean
    ) {
        this.done = false;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        let counter = 1;
        for await (const item of this.input) {
            if (this.done) {
                break;
            }
            let msg: MessageRef;
            if (item instanceof MessageRef) {
                msg = item;
            } else {
                msg = new MessageRef({}, item);
            }
            const metadata = {};
            if (msg.metadata<string>(EventSourcedMetadata.EventType) === undefined) {
                metadata[EventSourcedMetadata.EventType] = msg.payload.type;
            }
            if (this.stream) {
                if (msg.metadata<string>(EventSourcedMetadata.Stream) === undefined) {
                    metadata[EventSourcedMetadata.Stream] = this.stream;
                }
                if (msg.metadata<number>(EventSourcedMetadata.SequenceNumber) === undefined) {
                    metadata[EventSourcedMetadata.SequenceNumber] = counter++;
                }
            }
            msg.addMetadata(metadata);
            msg.once("released", async (_, v, e) => {
                if (this.captureResponses) {
                    if (v !== undefined) {
                        this.responses.push(v);
                    } else if (e !== undefined) {
                        this.responses.push(e);
                    }
                }
            });
            yield msg;
        }
    }

    public stop(): Promise<void> {
        this.done = true;
        return Promise.resolve();
    }
}
