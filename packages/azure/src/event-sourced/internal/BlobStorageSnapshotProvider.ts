/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IComponentContext, IRequireInitialization } from "@walmartlabs/cookie-cutter-core";
import { sortedIndex } from "lodash";
import { SpanContext } from "opentracing";
import { ISnapshotProvider } from "..";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";

function retrieveSnapshotIndex(target: number, list: number[]): number {
    const size = list.length;
    if (size < 1) {
        return -1;
    }
    if (target < list[0]) {
        return -1;
    }
    if (target >= list[size - 1]) {
        return size - 1;
    }
    const insertionIndex = sortedIndex(list, target);
    if (target === list[insertionIndex]) {
        return insertionIndex;
    } else {
        return insertionIndex - 1;
    }
}

export class BlobStorageSnapshotProvider<TSnapshot>
    implements ISnapshotProvider<TSnapshot>, IRequireInitialization
{
    private readonly client: BlobClient;

    constructor(config: IBlobStorageConfiguration) {
        this.client = new BlobClient(config);
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        await this.client.initialize(ctx);
    }

    public async get(
        spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<[number, TSnapshot]> {
        try {
            const listerResponse = await this.client.readAsText(spanContext, key);
            if (!listerResponse) {
                return [0, undefined];
            }
            const sequenceList = JSON.parse(listerResponse) as number[];
            let retrievalIndex = sequenceList.length - 1;
            if (atSn !== undefined) {
                retrievalIndex = retrieveSnapshotIndex(atSn, sequenceList);
            }
            if (retrievalIndex < 0) {
                return [0, undefined];
            }
            const returnedSequenceNumber = sequenceList[retrievalIndex];
            const blobName = `${key}-${returnedSequenceNumber}`;
            const response = await this.client.readAsText(spanContext, blobName);
            if (!response) {
                return [0, undefined];
            }
            return [returnedSequenceNumber, JSON.parse(response) as TSnapshot];
        } catch (e) {
            if (
                (e as any).statusCode === 404 &&
                ((e as any).code === "BlobNotFound" || (e as any).code === "ContainerNotFound")
            ) {
                return [0, undefined];
            }

            throw e;
        }
    }
}
