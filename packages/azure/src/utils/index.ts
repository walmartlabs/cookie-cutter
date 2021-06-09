/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ErrorResponse } from "@azure/cosmos";
import {
    EventSourcedMetadata,
    ISequenceConflictDetails,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";

export * from "./BlobClient";
export * from "./CosmosClient";
export * from "./CosmosOutputSinkBase";
export * from "./QueueClient";
export * from "./QueueClientWithLargeItemSupport";

export interface ICosmosMetadata {
    readonly source?: {
        readonly stream_id: string;
        readonly sn: number;
    };
}

export interface ICosmosDocument {
    readonly id: string;
    // `data` was converted to `encodedData` but we support it here for
    // historical reasons and backwards compatibility with the materialized view CosmosOutputSink
    readonly data?: any;
    readonly encodedData?: Uint8Array;
    readonly stream_id: string;
    readonly sn: number;
    readonly dt: number;
    readonly event_type: string;
    readonly metadata?: ICosmosMetadata;
    readonly trace: SpanContext;
    readonly ttl?: number;
}

export function cosmosMetadata(msg: MessageRef): ICosmosMetadata {
    const stream_id = msg.metadata<string>(EventSourcedMetadata.Stream);
    const sn = msg.metadata<number>(EventSourcedMetadata.SequenceNumber);

    if (!stream_id) {
        return {};
    } else {
        return {
            source: {
                stream_id,
                sn,
            },
        };
    }
}

export function isRetryableError(e: ErrorResponse): boolean {
    if (!e || !e.body || !e.body.message) {
        return false;
    }
    const msg: string = e.body.message;
    return e.code === 429 || (msg && msg.includes("DB Query returned FALSE: ")); // keep the strings synced to ../resources/bulkInsertSproc.js and ../resources/upsertSproc.js
}

export function isSequenceConflict(e: ErrorResponse): boolean {
    if (!e || !e.body || !e.body.message) {
        return false;
    }
    const msg: string = e.body.message;
    return (
        msg.includes("Sequence Conflict for document") || // keep the strings synced to ../resources/bulkInsertSproc.js and ../resources/upsertSproc.js
        (msg.includes("Failed to create document number") && msg.includes("Latest valid SN")) || // this is from old sprocs before changing the error messages
        msg.includes("Optimistic Concurrent Error") // this is from old sprocs before changing the error messages
    );
}

export function getSequenceConflictDetails(e: ErrorResponse): ISequenceConflictDetails {
    const noDetails = { key: "N/A", actualSn: -1, expectedSn: -1, newSn: -1 };
    if (!e || !e.body || !e.body.message) {
        return noDetails;
    }
    const msg: string = e.body.message;
    let matches = msg.match(
        /stream_id: (.+?), new sn: (\d+), expected sn: (\d+), actual sn: (\d+)./
    );
    if (matches) {
        return {
            key: matches[1],
            newSn: parseInt(matches[2], 10),
            expectedSn: parseInt(matches[3], 10),
            actualSn: parseInt(matches[4], 10),
        };
    }

    matches = msg.match(
        /Failed to create document number: \d+ with SN: (\d+)\. Latest valid SN: (\d+)\./
    );
    if (matches) {
        return {
            key: "N/A",
            actualSn: parseInt(matches[2], 10),
            expectedSn: parseInt(matches[1], 10) - 1,
            newSn: parseInt(matches[1], 10),
        };
    }

    matches = msg.match(
        /Optimistic Concurrent Error: Expected Current SN: (\d+)\. Received SN: (\d+)\. Document's New SN: (\d+)/
    );
    if (matches) {
        return {
            key: "N/A",
            actualSn: parseInt(matches[2], 10),
            expectedSn: parseInt(matches[1], 10),
            newSn: parseInt(matches[3], 10),
        };
    }
    return noDetails;
}
