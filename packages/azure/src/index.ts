/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IMessageEncoder,
    IComponentContext,
    IRequireInitialization,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { BlobStorageConfiguration, CosmosConfiguration } from "./config";
import * as es from "./event-sourced";
import * as ma from "./materialized";
import * as st from "./streaming";
import { BlobClient, CosmosClient } from "./utils";
import { BlobService, createBlobService, ServiceResponse, common } from "azure-storage";

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
    write(context: SpanContext, text: Buffer | string, blobId: string): Promise<void>;
    readAsText(context: SpanContext, blobId: string): Promise<string>;
    exists(context: SpanContext, blobId: string): Promise<boolean>;
    deleteFolderIfExists(folderSubPath: string, context: SpanContext): Promise<boolean>;
    listAllBlobs(
        prefix: string,
        continuationToken: common.ContinuationToken,
        context: SpanContext
    ): Promise<string[]>;
    deleteBlobIfExists(blobSubPath: string, context: SpanContext): Promise<boolean>;
    writeLargeObject(obj: any, blobId: string, context: SpanContext): Promise<void>;
}

export function createBlobClient(configuration: IBlobStorageConfiguration): IBlobClient {
    configuration = config.parse(BlobStorageConfiguration, configuration);
    return new BlobClient(configuration);
}
