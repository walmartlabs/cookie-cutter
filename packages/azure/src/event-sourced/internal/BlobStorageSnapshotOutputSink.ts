/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IComponentContext,
    IOutputSink,
    IOutputSinkGuarantees,
    IRequireInitialization,
    IStoredMessage,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { sortedIndex } from "lodash";
import { IBlobStorageSnapshotOutputSinkConfiguration } from "..";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";

export class BlobStorageSnapshotOutputSink
    implements IOutputSink<IStoredMessage>, IRequireInitialization
{
    private readonly client: BlobClient;
    private readonly frequency: number;

    constructor(
        private readonly config: IBlobStorageConfiguration &
            IBlobStorageSnapshotOutputSinkConfiguration
    ) {
        this.client = new BlobClient(config);
        this.frequency = this.config.frequency;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        return this.client.initialize(context);
    }

    public async sink(output: IterableIterator<IStoredMessage>): Promise<void> {
        for (const item of output) {
            const atSn = item.state.seqNum + 1;
            if (atSn % this.frequency !== 0) {
                continue;
            }
            const newBlobName = `${item.state.key}-${atSn}`;
            const listerName = item.state.key;
            await this.client.write(
                item.spanContext,
                newBlobName,
                JSON.stringify(item.message.payload)
            );
            let sequenceList: number[] = [];
            try {
                const listerResponse = await this.client.readAsText(item.spanContext, listerName);
                if (listerResponse) {
                    sequenceList = JSON.parse(listerResponse) as number[];
                    if (!(sequenceList && Array.isArray(sequenceList))) {
                        sequenceList = [];
                    }
                }
            } catch (e) {
                if (!((e as any).statusCode === 404 && (e as any).code === "BlobNotFound")) {
                    throw e;
                }
            }
            const insertionIndex = sortedIndex(sequenceList, atSn);
            let exactMatch = false;
            if (insertionIndex < sequenceList.length) {
                exactMatch = atSn === sequenceList[insertionIndex];
            }
            if (!exactMatch) {
                sequenceList.splice(insertionIndex, 0, atSn);
                await this.client.write(item.spanContext, listerName, JSON.stringify(sequenceList));
            }
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: true,
        };
    }
}
