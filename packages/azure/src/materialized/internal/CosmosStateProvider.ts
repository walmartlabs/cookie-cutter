/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    EncodedMessage,
    IComponentContext,
    IDisposable,
    IMessage,
    IMessageEncoder,
    IRequireInitialization,
    isEmbeddable,
    IState,
    IStateType,
    Lifecycle,
    makeLifecycle,
    MaterializedViewStateProvider,
    StateRef,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { isNullOrUndefined } from "util";
import { ICosmosQueryClient } from "../..";
import { ICosmosDocument } from "../../utils";
import { getCollectionInfo } from "../../utils/helpers";

export class CosmosStateProvider<TState extends IState<TSnapshot>, TSnapshot>
    extends MaterializedViewStateProvider<TState, TSnapshot>
    implements IRequireInitialization, IDisposable
{
    private readonly client: Lifecycle<ICosmosQueryClient>;
    constructor(
        TState: IStateType<TState, TSnapshot>,
        client: ICosmosQueryClient,
        private readonly encoder: IMessageEncoder
    ) {
        super(TState);
        this.client = makeLifecycle(client);
    }

    public async initialize(context: IComponentContext) {
        await this.client.initialize(context);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }

    public async get(spanContext: SpanContext, key: string): Promise<StateRef<TState>> {
        const { collectionId, partitionKey } = getCollectionInfo(key);

        const result = await this.client.query(
            spanContext,
            {
                query: `SELECT c.data, c.event_type, c.sn FROM c
                        WHERE c.stream_id=@stream_id`,
                parameters: [{ name: "@stream_id", value: partitionKey }],
            },
            collectionId
        );

        if (result.length > 1) {
            throw new Error(`found multiple documents for key '${key}', this is not expected`);
        } else if (result.length === 0) {
            return new StateRef(new this.TState(), key, 0);
        }

        const record: ICosmosDocument = result[0];
        if (isNullOrUndefined(record.data)) {
            return new StateRef(new this.TState(), key, record.sn);
        }

        let msg: IMessage;
        if (isEmbeddable(this.encoder)) {
            msg = new EncodedMessage(
                this.encoder,
                record.event_type,
                this.encoder.fromJsonEmbedding(record.data)
            );
        } else {
            msg = new EncodedMessage(
                this.encoder,
                record.event_type,
                new Uint8Array(record.data.data)
            );
        }

        return new StateRef(new this.TState(msg.payload as TSnapshot), key, record.sn);
    }
}
