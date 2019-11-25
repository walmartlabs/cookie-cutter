/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    EventSourcedStateProvider,
    IMessageDeduper,
    IOutputSink,
    IState,
    IStateProvider,
    IStateType,
    IStoredMessage,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { IBlobStorageConfiguration, ICosmosConfiguration } from "..";
import { BlobStorageConfiguration, CosmosConfiguration } from "../config";
import { CosmosClient } from "../utils";
import {
    BlobStorageSnapshotOutputSink,
    BlobStorageSnapshotOutputSinkConfiguration,
    BlobStorageSnapshotProvider,
    CosmosMessageDeduper,
    CosmosOutputSink,
    CosmosStateAggregationSource,
    NullSnapshotProvider,
} from "./internal";

export interface ISnapshotProvider<TSnapshot> {
    get(spanContext: SpanContext, key: string, atSn?: number): Promise<[number, TSnapshot]>;
}

export interface IBlobStorageSnapshotOutputSinkConfiguration {
    readonly frequency?: number;
}

export function cosmosState<TState extends IState<TSnapshot>, TSnapshot>(
    configuration: ICosmosConfiguration,
    TState: IStateType<TState, TSnapshot>,
    aggregator: any,
    snapshotProvider?: ISnapshotProvider<TSnapshot>
): IStateProvider<TState> {
    configuration = config.parse(CosmosConfiguration, configuration);

    if (!snapshotProvider) {
        snapshotProvider = new NullSnapshotProvider<TSnapshot>();
    }
    const client = new CosmosClient(configuration);
    const source = new CosmosStateAggregationSource(
        client,
        configuration.encoder,
        snapshotProvider
    );
    return new EventSourcedStateProvider(TState, aggregator, source);
}

export function cosmosSink(configuration: ICosmosConfiguration): IOutputSink<IStoredMessage> {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosOutputSink(configuration);
}

export function blobStorageSnapshotSink(
    configuration: IBlobStorageConfiguration & IBlobStorageSnapshotOutputSinkConfiguration
): IOutputSink<IStoredMessage> {
    configuration = config.parse(BlobStorageSnapshotOutputSinkConfiguration, configuration, {
        frequency: 100,
    });
    return new BlobStorageSnapshotOutputSink(configuration);
}

export function blobStorageSnapshotProvider<TSnapshot>(
    configuration: IBlobStorageConfiguration
): ISnapshotProvider<TSnapshot> {
    configuration = config.parse(BlobStorageConfiguration, configuration);
    return new BlobStorageSnapshotProvider(configuration);
}

export function cosmosDeduper(configuration: ICosmosConfiguration): IMessageDeduper {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosMessageDeduper(new CosmosClient(configuration));
}
