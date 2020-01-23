/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";

export class DummyMessageEncoder implements IMessageEncoder {
    public readonly mimeType: string = "application/dummy";

    // encode mimics the expected result of using the underlying cosmos client in combination
    // with proto encoders.
    // proto encoders return a buffer and the cosmos client runs toJSON() on that resulting in
    // { type: "Buffer", data: [...] }
    public encode(msg: IMessage): Uint8Array {
        const s = JSON.stringify(msg.payload);
        const buffer = Buffer.from(s);
        return Buffer.from(JSON.stringify(buffer.toJSON()));
    }

    public decode(data: Uint8Array, typeName: string): IMessage {
        const jsonEncoded = data.toString();
        return {
            type: typeName,
            payload: JSON.parse(jsonEncoded),
        };
    }
}
