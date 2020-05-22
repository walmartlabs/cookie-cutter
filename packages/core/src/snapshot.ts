/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ICacheOptions } from "./cache";
import { createEventStreamHandler } from "./eventStream";
import { IDispatchContext, IMessage, IMessageEncoder, IState, IStateType, StateRef } from "./model";

class Snapshot {}

export function snapshotter<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IStateType<TState, TSnapshot>,
    aggregator: any,
    options?: ICacheOptions
): any {
    const sink = (ctx: IDispatchContext<TState>, stateRef: StateRef<TState>, state: TState) => {
        ctx.store(Snapshot, stateRef, state.snap());
        return Promise.resolve();
    };

    return createEventStreamHandler(TState, aggregator, sink, options);
}

export class SnapshotJsonMessageEncoder implements IMessageEncoder {
    public readonly mimeType: string = "application/json";

    public encode(msg: IMessage): Uint8Array {
        if (msg.type === Snapshot.name) {
            return Buffer.from(JSON.stringify(msg.payload));
        }

        throw new Error("unknown message type");
    }

    public decode(data: Uint8Array, typeName?: string): IMessage {
        if (typeName === Snapshot.name) {
            return {
                type: Snapshot.name,
                payload: JSON.parse(Buffer.from(data).toString()),
            };
        }

        throw new Error("unknown message type");
    }
}
