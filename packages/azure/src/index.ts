/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder, IRequireInitialization } from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { BlobStorageConfiguration, CosmosConfiguration } from "./config";
import * as es from "./event-sourced";
import * as ma from "./materialized";
import * as st from "./streaming";
import { BlobClient, CosmosClient, IBlobClientPaginationToken } from "./utils";
import { BlobService } from "azure-storage";

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
    readonly localStoragePath?: string;
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
    createContainerIfNotExists(context?: SpanContext): Promise<BlobService.ContainerResult>;

    writeAsText(context: SpanContext, text: Buffer | string, blobId: string): Promise<void>;
    readAsText(context: SpanContext, blobId: string): Promise<string>;
    writeAsLargeText(text: string, blobId: string, context: SpanContext): Promise<void>;
    // TODO: Add a method for reading large text

    exists(context: SpanContext, blobId: string): Promise<boolean>;
    deleteFolderIfExists(folderId: string, context: SpanContext): Promise<boolean>;
    deleteBlobIfExists(blobId: string, context: SpanContext): Promise<boolean>;
    listAllBlobs(
        prefix: string,
        continuationToken: IBlobClientPaginationToken,
        context: SpanContext
    ): Promise<string[]>;
}

export function createBlobClient(configuration: IBlobStorageConfiguration): IBlobClient {
    configuration = config.parse(BlobStorageConfiguration, configuration);
    return new BlobClient(configuration);
}
