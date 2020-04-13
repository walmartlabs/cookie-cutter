/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { CosmosConfiguration } from "./config";
import * as es from "./event-sourced";
import * as ma from "./materialized";
import * as st from "./streaming";
import { CosmosClient } from "./utils";

export const EventSourced = es;
export const Materialized = ma;
export const Streaming = st;

export interface ICosmosConfiguration {
    readonly url: string;
    readonly key: string;
    readonly databaseId: string;
    readonly collectionId: string;
    readonly encoder: IMessageEncoder;
}

export interface IBlobStorageConfiguration {
    readonly url?: string;
    readonly storageAccount: string;
    readonly storageAccessKey: string;
    readonly container: string;
    readonly requestTimeout?: number;
}

export interface ICosmosQuery {
    query: string;
    parameters?: Array<{
        name: string;
        value: string | number | boolean;
    }>;
}

export interface ICosmosQueryClient {
    query(spanContext: SpanContext, query: ICosmosQuery): Promise<any[]>;
}

export function cosmosQueryClient(configuration: ICosmosConfiguration): ICosmosQueryClient {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosClient(configuration);
}
