/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IMessage,
    IStoredMessage,
    iterate,
    MessageRef,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";

export interface IAzureError {
    statusCode: number;
    code: string;
}

export function makeAzureError(inStatusCode: number, inCode: string): IAzureError {
    const err: IAzureError = {
        code: inCode,
        statusCode: inStatusCode,
    };
    return err;
}

export function makeReturnString(intputObject: any): any {
    return JSON.stringify(intputObject);
}

export function makeIterableIterator(
    key: string,
    sequenceNumber: number,
    inputPayload: any
): IterableIterator<IStoredMessage> {
    const someIMessage: IMessage = { type: "Buffer", payload: inputPayload };
    const someMessage: IStoredMessage = {
        message: someIMessage,
        state: new StateRef({}, key, sequenceNumber),
        original: new MessageRef({}, someIMessage),
        spanContext: new SpanContext(),
        metadata: {},
    };
    return iterate([someMessage]);
}
