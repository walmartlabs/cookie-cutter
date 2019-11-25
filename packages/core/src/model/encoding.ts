/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage } from "./message";

export interface IMessageEncoder {
    readonly mimeType: string;
    encode(msg: IMessage): Uint8Array;
    decode(data: Uint8Array, typeName?: string): IMessage;
}

export interface IEncodedMessageEmbedder {
    toJsonEmbedding(encoded: Uint8Array): any;
    fromJsonEmbedding(embedding: any): Uint8Array;
}

export function isEmbeddable(encoder: any): encoder is IEncodedMessageEmbedder {
    return encoder.toJsonEmbedding !== undefined;
}
