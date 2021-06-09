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

/**
 * When connecting to a blob, the BlobClient:
 * uses the connectionString (if provided) to connect, otherwise
 * uses the url (if provided) and account and key to connect, otherwise
 * uses the account and key to construct a standard url and connect
 */
export interface IBlobStorageConfiguration {
    readonly storageAccount?: string;
    readonly storageAccessKey?: string;
    readonly container: string;
    /** Ex:
     * `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;
     * AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;
     * BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
     * QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;
     * TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;`
     */
    readonly connectionString?: string;
    /** Ex: `https://account.blob.core.windows.net`
     * Deprecated: uses as a connection string
     */
    readonly url?: string;
}

export interface ICosmosQuery {
    query: string;
    parameters?: {
        name: string;
        value: string | number | boolean;
    }[];
}

export enum CosmosMetadata {
    // Cosmos item level TTL in seconds.  Note that this is effective only if container level TTL is enabled
    // See https://docs.microsoft.com/en-us/azure/cosmos-db/how-to-time-to-live?tabs=dotnetv2%2Cjavav4#nodejs-set-ttl-item
    TTL = "ttl",
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
