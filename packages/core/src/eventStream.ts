/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as LRU from "lru-cache";
import { ICacheOptions } from "./cache";
import { EventSourcedMetadata, IDispatchContext, IState, IStateType, StateRef } from "./model";

export type StateHandler<TState> = (
    ctx: IDispatchContext<TState>,
    stateRef: StateRef<TState>,
    state: TState
) => Promise<void>;

export function createEventStreamHandler<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IStateType<TState, TSnapshot>,
    aggregator: any,
    stateHandler: StateHandler<TState>,
    options?: ICacheOptions
): any {
    options = options || {};
    const cache: LRU<string, StateRef<TState>> = new LRU({ max: options.maxSize || 1000 });

    const handler = {};
    for (const prop of Object.getOwnPropertyNames(aggregator.__proto__)) {
        if (prop.startsWith("on")) {
            handler[prop] = async function (
                msg: any,
                ctx: IDispatchContext<TState>
            ): Promise<void> {
                const key = ctx.metadata<string>(EventSourcedMetadata.Stream);
                const sn = ctx.metadata<number>(EventSourcedMetadata.SequenceNumber);

                let stateRef = cache.get(key);
                if (!stateRef || stateRef.seqNum !== sn - 1) {
                    const current = stateRef ? `${stateRef.key}@${stateRef.seqNum}` : "N/A";
                    const expected = `${key}@${sn - 1}`;
                    ctx.logger.warn(`cache miss on '${prop.substr(2)}'`, { current, expected });
                    stateRef = await ctx.state.get(key, sn - 1);
                }

                const cloned = new TState(stateRef.state.snap());
                ctx.logger.info(
                    `applying '${prop.substr(2)}' from '${key}@${sn}' to ${stateRef.key}@${
                        stateRef.seqNum
                    }`
                );
                aggregator[prop](msg, cloned);
                cache.set(stateRef.key, new StateRef(cloned, stateRef.key, sn));

                await stateHandler(ctx, stateRef, cloned);
            }.bind(handler);
        }
    }

    return handler;
}
