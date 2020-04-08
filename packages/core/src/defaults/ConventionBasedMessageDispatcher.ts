/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IDispatchContext,
    IMessage,
    IMessageDispatcher,
    IValidateResult,
    NoInvalidHandlerError,
} from "../model";
import { prettyEventName } from "../utils";

export class ConventionBasedMessageDispatcher implements IMessageDispatcher {
    constructor(private target: any) {}

    public canDispatch(msg: IMessage): boolean {
        const type = prettyEventName(msg.type);
        const name = `on${type}`;
        const func = this.target[name];
        return func !== undefined;
    }

    public async dispatch(
        msg: IMessage,
        ctx: IDispatchContext,
        metadata: { validation: IValidateResult }
    ): Promise<any> {
        if (metadata.validation.success) {
            const type = prettyEventName(msg.type);
            const calls: [string, any, boolean][] = [
                ["before", msg, false],
                [`on${type}`, msg.payload, true],
                ["after", msg, false],
            ];

            let result: any | undefined;
            for (const [name, msg, store] of calls) {
                const func = this.target[name];
                if (func) {
                    let val = func.apply(this.target, [msg, ctx]);
                    if (this.isPromise(val)) {
                        val = await val;
                    }

                    if (store) {
                        result = val;
                    }
                }
            }

            return result;
        } else {
            const invalid = "invalid";
            const func = this.target[invalid];
            if (func) {
                await func.apply(this.target, [msg, ctx]);
            } else {
                ctx.logger.error("received invalid message", metadata.validation.message, {
                    type: msg.payload.type,
                });
                throw new NoInvalidHandlerError();
            }
        }
    }

    private isPromise(val: any): val is Promise<void> {
        return val && val.then && val.catch;
    }
}
