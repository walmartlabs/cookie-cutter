/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IMessageDeduper,
    IOutputSink,
    IState,
    IStateProvider,
    IStateType,
    IStoredMessage,
} from "@walmartlabs/cookie-cutter-core";
import { ICosmosConfiguration } from "..";
import { CosmosConfiguration } from "../config";
import { CosmosMessageDeduper } from "../event-sourced/internal";
import { CosmosClient } from "../utils";
import { CosmosOutputSink, CosmosStateProvider } from "./internal";

export function cosmosState<TState extends IState<TSnapshot>, TSnapshot>(
    configuration: ICosmosConfiguration,
    TState: IStateType<TState, TSnapshot>
): IStateProvider<TState> {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosStateProvider<TState, TSnapshot>(
        TState,
        new CosmosClient(configuration),
        configuration.encoder
    );
}

export function cosmosSink(configuration: ICosmosConfiguration): IOutputSink<IStoredMessage> {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosOutputSink(configuration);
}

export function cosmosDeduper(configuration: ICosmosConfiguration): IMessageDeduper {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosMessageDeduper(new CosmosClient(configuration));
}
