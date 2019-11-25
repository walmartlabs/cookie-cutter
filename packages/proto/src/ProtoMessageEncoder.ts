/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { IProtoMessageEncoderRegistry } from ".";

export class ProtoMessageEncoder implements IMessageEncoder {
    public readonly mimeType: string = "application/x-protobuf";

    constructor(private readonly lookup: IProtoMessageEncoderRegistry) {}

    public encode(msg: IMessage): Uint8Array {
        const encoder = this.lookup.toEncoder(msg.type);
        return encoder.encode(msg.payload).finish();
    }

    public decode(data: Uint8Array, typeName: string): IMessage {
        const encoder = this.lookup.toEncoder(typeName);
        return {
            type: typeName,
            payload: encoder.decode(data),
        };
    }
}
