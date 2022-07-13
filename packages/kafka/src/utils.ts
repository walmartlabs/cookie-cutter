/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { getRootProjectPackageInfo } from "@walmartlabs/cookie-cutter-core";
import { CompressionCodecs, CompressionTypes } from "kafkajs";
import * as LZ4Codec from "kafkajs-lz4";
import * as SnappyCodec from "kafkajs-snappy";
import * as uuid from "uuid";

export function generateClientId(clientIdPrefix?: string) {
    const clientId = `${getRootProjectPackageInfo().name}-${uuid.v4()}`;
    if (clientIdPrefix) {
        return `${clientIdPrefix}-${clientId}`;
    }
    return clientId;
}

export function loadCompressionPlugins() {
    CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
    CompressionCodecs[CompressionTypes.LZ4] = new (LZ4Codec as any)().codec;
}
