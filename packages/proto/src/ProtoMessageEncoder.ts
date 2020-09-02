/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IMessage,
    IMessageEncoder,
    IEncodedMessageEmbedder,
} from "@walmartlabs/cookie-cutter-core";
import { IProtoMessageEncoderRegistry } from ".";
import { isString } from "util";

export class ProtoMessageEncoder implements IMessageEncoder, IEncodedMessageEmbedder {
    public readonly mimeType: string = "application/x-protobuf";

    constructor(
        private readonly lookup: IProtoMessageEncoderRegistry,
        private readonly base64Encode: boolean = false
    ) {}

    public toJsonEmbedding(encoded: Uint8Array): any {
        return this.base64Encode ? Buffer.from(encoded).toString("base64") : encoded;
    }

    public fromJsonEmbedding(embedding: any): Uint8Array {
        return isString(embedding) ? Buffer.from(embedding, "base64") : embedding.data;
    }

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
