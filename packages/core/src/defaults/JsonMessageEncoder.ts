/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IEncodedMessageEmbedder, IMessage, IMessageEncoder } from "../model";

export class JsonMessageEncoder implements IMessageEncoder, IEncodedMessageEmbedder {
    public readonly mimeType: string = "application/json";

    public toJsonEmbedding(encoded: Uint8Array) {
        return this.decode(encoded, null).payload;
    }

    public fromJsonEmbedding(embedding: any): Uint8Array {
        return this.encode({ payload: embedding, type: null });
    }

    public encode(msg: IMessage): Uint8Array {
        return Buffer.from(JSON.stringify(msg.payload));
    }

    public decode(data: Uint8Array, typeName?: string): IMessage {
        return {
            type: typeName,
            payload: JSON.parse(Buffer.from(data).toString()),
        };
    }
}
