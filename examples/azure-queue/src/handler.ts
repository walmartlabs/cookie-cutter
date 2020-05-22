/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { QueueMetadata } from "@walmartlabs/cookie-cutter-azure/dist/streaming";
import { IDispatchContext } from "@walmartlabs/cookie-cutter-core";
import { IInterval } from "@walmartlabs/cookie-cutter-timer";
import * as m from "./model";

const LARGE_STRING_PART =
    "1234567891011121314151617181920212223232425262728293031323334353637383940";
let LARGE_STRING = LARGE_STRING_PART;
for (let i = 0; i < 20; i++) {
    LARGE_STRING += LARGE_STRING_PART;
}

export class Handler {
    public async onInterval(msg: IInterval, ctx: IDispatchContext) {
        const id = msg.eventTime.toISOString();
        ctx.publish(m.RegualarSizeMessage, {
            id,
        });
        ctx.publish(m.LargeSizeMessage, {
            id,
            lotsOfStrings: new Array(200).fill(LARGE_STRING),
        });
    }
    public async onRegualarSizeMessage(
        msg: m.RegualarSizeMessage,
        ctx: IDispatchContext
    ): Promise<void> {
        ctx.logger.info("onRegualarSizeMessage", {
            id: msg.id,
            DequeueCount: ctx.metadata<string>(QueueMetadata.DequeueCount),
        });
    }
    public async onLargeSizeMessage(msg: m.LargeSizeMessage, ctx: IDispatchContext): Promise<void> {
        ctx.logger.info("onLargeSizeMessage", {
            id: msg.id,
            hasPayload: msg.lotsOfStrings && msg.lotsOfStrings.length,
        });
    }
}
