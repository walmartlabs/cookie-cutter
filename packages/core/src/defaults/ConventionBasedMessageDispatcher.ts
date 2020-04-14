/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IDispatchContext, IMessage, IMessageDispatcher, IValidateResult } from "../model";
import { prettyEventName } from "../utils";

export class ConventionBasedMessageDispatcher implements IMessageDispatcher {
    constructor(private target: any) {}

    public canDispatch(msg: IMessage): boolean {
        const type = prettyEventName(msg.type);
        const name = `on${type}`;
        const func = this.target[name];
        return func !== undefined;
    }

    public canHandleInvalid(): boolean {
        const invalid = "invalid";
        return this.target[invalid] !== undefined;
    }

    public async dispatch(
        msg: IMessage,
        ctx: IDispatchContext,
        metadata: { validation: IValidateResult }
    ): Promise<any> {
        const type = prettyEventName(msg.type);
        const calls: [string, any, boolean][] = metadata.validation.success
            ? [
                  ["before", msg, false],
                  [`on${type}`, msg.payload, true],
                  ["after", msg, false],
              ]
            : [["invalid", msg, true]];

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
    }

    private isPromise(val: any): val is Promise<void> {
        return val && val.then && val.catch;
    }
}
