/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IPublishedMessage, MessageRef } from "@walmartlabs/cookie-cutter-core";
import { KafkaMetadata } from "..";

type KafkaMetadataMapping = { [key in KafkaMetadata]: any };

export function createPublishedMessage({
    payload,
    metadata = {},
}: {
    payload: any;
    metadata?: Partial<KafkaMetadataMapping>;
}): IPublishedMessage {
    const imessage: IMessage = { type: "test", payload };

    return {
        message: imessage,
        metadata,
        original: new MessageRef(metadata, imessage),
        spanContext: null,
    };
}
