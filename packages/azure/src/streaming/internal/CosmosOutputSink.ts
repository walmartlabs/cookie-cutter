/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IOutputSink, IPublishedMessage, RetrierContext } from "@walmartlabs/cookie-cutter-core";
import { isNullOrUndefined } from "util";
import { ICosmosConfiguration } from "../..";
import { cosmosMetadata, CosmosOutputSinkBase, ICosmosDocument } from "../../utils";

export class CosmosOutputSink
    extends CosmosOutputSinkBase
    implements IOutputSink<IPublishedMessage>
{
    constructor(config: ICosmosConfiguration) {
        super(config);
    }

    public async sink(
        output: IterableIterator<IPublishedMessage>,
        retry: RetrierContext
    ): Promise<void> {
        const documents: ICosmosDocument[] = [];
        for (const msg of output) {
            const doc: ICosmosDocument = {
                id: msg.metadata.key,
                encodedData: isNullOrUndefined(msg.message.payload)
                    ? undefined
                    : this.formatData(msg.message),
                stream_id: msg.metadata.key,
                sn: 0,
                dt: Date.now(),
                event_type: msg.message.type,
                trace: msg.spanContext,
                metadata: {
                    ...cosmosMetadata(msg.original),
                },
            };
            documents.push(doc);
        }
        await this.doBulkInsert(documents, false, retry);
    }
}
