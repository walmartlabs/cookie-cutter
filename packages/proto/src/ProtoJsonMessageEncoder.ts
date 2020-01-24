/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IEncodedMessageEmbedder,
    IMessage,
    IMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { IProtoMessageEncoderRegistry } from ".";

export class ProtoJsonMessageEncoder implements IMessageEncoder, IEncodedMessageEmbedder {
    public readonly mimeType: string = "application/json";

    constructor(private readonly lookup: IProtoMessageEncoderRegistry) {}

    public toJsonEmbedding(encoded: Uint8Array): any {
        return JSON.parse(encoded.toString());
    }

    public fromJsonEmbedding(embedding: any): Uint8Array {
        return Buffer.from(JSON.stringify(embedding));
    }

    public encode(msg: IMessage): Uint8Array {
        return Buffer.from(JSON.stringify(msg.payload));
    }

    public decode(data: Uint8Array, typeName: string): IMessage {
        const encoder = this.lookup.toEncoder(typeName);
        return {
            type: typeName,
            payload: encoder.fromObject(JSON.parse(data.toString())),
        };
    }
}
