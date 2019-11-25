/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    ILogger,
    IMessage,
    IMessageMetricAnnotator,
    IMessageValidator,
    IMetricTags,
} from "../../model";
import { BufferedDispatchContext } from "../BufferedDispatchContext";

export function annotator(msg: IMessage, metricRecorder: IMessageMetricAnnotator): IMetricTags {
    return metricRecorder.annotate(msg);
}

export function validate(
    context: BufferedDispatchContext,
    validator: IMessageValidator,
    logger: ILogger
): boolean {
    let valid = true;
    for (const msg of context.published) {
        const result = msg.metadata.tombstone ? { success: true } : validator.validate(msg.message);
        if (!result.success) {
            logger.error("attempted to publish invalid message", result.message, {
                type: msg.message.type,
            });
            valid = false;
        }
    }

    for (const msg of context.stored) {
        const result = validator.validate(msg.message);
        if (!result.success) {
            logger.error("attempted to store invalid message", result.message, {
                type: msg.message.type,
            });
            valid = false;
        }
    }

    return valid;
}
