/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder, IRequireInitialization } from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { CosmosConfiguration, BlobStorageConfiguration } from "./config";
import * as es from "./event-sourced";
import * as ma from "./materialized";
import * as st from "./streaming";
import { BlobClient, CosmosClient } from "./utils";

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
    readonly storageAccount: string;
    readonly storageAccessKey: string;
    readonly container: string;
    readonly url: string;
    readonly connectionString?: string;
}

export interface ICosmosQuery {
    query: string;
    parameters?: {
        name: string;
        value: string | number | boolean;
    }[];
}

export interface ICosmosQueryClient {
    query(spanContext: SpanContext, query: ICosmosQuery, collectionId?: string): Promise<any[]>;
}

export function cosmosQueryClient(configuration: ICosmosConfiguration): ICosmosQueryClient {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosClient(configuration);
}

export interface IBlobClient extends IRequireInitialization {
    createContainerIfNotExists(context?: SpanContext): Promise<boolean>;

    write(context: SpanContext, blobId: string, content: Buffer | string): Promise<void>;
    readAsText(context: SpanContext, blobId: string): Promise<string>;
    // TODO: Add a method for reading Buffer

    exists(context: SpanContext, blobId: string): Promise<boolean>;
    deleteFolderIfExists(context: SpanContext, folderId: string): Promise<boolean>;
    deleteBlobIfExists(context: SpanContext, blobId: string): Promise<boolean>;
    listBlobs(context: SpanContext, prefix: string): AsyncIterableIterator<string>;
}

export function createBlobClient(configuration: IBlobStorageConfiguration): IBlobClient {
    configuration = config.parse(BlobStorageConfiguration, configuration);
    return new BlobClient(configuration);
}
