/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IDispatchContext } from "@walmartlabs/cookie-cutter-core";
import * as m from "./model";

export class Handler {
    public async onChangeTally(
        msg: m.IRequest,
        ctx: IDispatchContext<m.TallyState>
    ): Promise<m.IResponse> {
        const stateRef = await ctx.state.get(msg.id);
        if (msg.delta > 0) {
            ctx.store(m.Increment, stateRef, new m.Increment(msg.delta));
        } else {
            ctx.store(m.Decrement, stateRef, new m.Decrement(msg.delta * -1));
        }

        return {
            newTotal: ctx.state.compute(msg.id).state.total,
        };
    }
}
