/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IMessageEncoder } from "../model";

export class NullMessageEncoder implements IMessageEncoder {
    public readonly mimeType: string = "application/octet-stream";

    public encode(msg: IMessage): Uint8Array {
        if (msg.payload instanceof Uint8Array || msg.payload instanceof Buffer) {
            return msg.payload;
        }
        throw new Error(
            "NullMessageEncoder requires message payload to be instance of Uint8Array or Buffer"
        );
    }

    public decode(data: Uint8Array, typeName?: string): IMessage {
        return {
            type: typeName,
            payload: Buffer.from(data),
        };
    }
}
