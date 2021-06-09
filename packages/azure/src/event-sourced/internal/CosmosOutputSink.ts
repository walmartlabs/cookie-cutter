/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IOutputSink,
    isStoredMessage,
    IStateVerification,
    IStoredMessage,
    RetrierContext,
} from "@walmartlabs/cookie-cutter-core";
import { isNullOrUndefined } from "util";
import { ICosmosConfiguration, CosmosMetadata } from "../../";
import { cosmosMetadata, CosmosOutputSinkBase, ICosmosDocument } from "../../utils";

export class CosmosOutputSink extends CosmosOutputSinkBase implements IOutputSink<IStoredMessage> {
    constructor(config: ICosmosConfiguration) {
        super(config);
    }

    public async sink(
        output: IterableIterator<IStoredMessage | IStateVerification>,
        retry: RetrierContext
    ): Promise<void> {
        const counter = new Map<string, number>();
        const documents: ICosmosDocument[] = [];
        const verification = new Array<IStateVerification>();
        for (const msg of output) {
            if (!isStoredMessage(msg)) {
                verification.push(msg);
                continue;
            }
            const inc = counter.get(msg.state.uniqueId) || 1;
            counter.set(msg.state.uniqueId, inc + 1);
            const doc: ICosmosDocument = {
                id: `${msg.state.key}-${msg.state.seqNum + inc}`,
                encodedData: isNullOrUndefined(msg.message.payload)
                    ? undefined
                    : this.formatData(msg.message),
                stream_id: msg.state.key,
                sn: msg.state.seqNum + inc,
                dt: Date.now(),
                event_type: msg.message.type,
                trace: msg.spanContext,
                metadata: {
                    ...cosmosMetadata(msg.original),
                },
                ttl: msg.metadata ? msg.metadata[CosmosMetadata.TTL] : undefined,
            };
            documents.push(doc);
        }
        if (documents.length > 0) {
            await this.doBulkInsert(documents, true, retry);
        } else if (verification.length > 0) {
            await this.verifyState(
                verification[0].state,
                verification[0].original.spanContext,
                retry
            );
        }
    }
}
