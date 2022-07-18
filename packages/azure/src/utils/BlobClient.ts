/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IBlobStorageConfiguration, IBlobClient } from "..";
import { streamToString } from "./helpers";

export class BlobClient implements IBlobClient, IRequireInitialization {
    private client: BlobServiceClient;
    private containerName: string;
    private storageAccount: string;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName = "Azure Blob Client Call";

    constructor(config: IBlobStorageConfiguration) {
        if (config.connectionString) {
            this.client = BlobServiceClient.fromConnectionString(config.connectionString);
        } else if (config.url) {
            if (config.url.indexOf("http") === 0) {
                this.client = new BlobServiceClient(
                    config.url,
                    new StorageSharedKeyCredential(config.storageAccount, config.storageAccessKey)
                );
            } else {
                this.client = BlobServiceClient.fromConnectionString(config.url);
            }
        } else {
            this.client = new BlobServiceClient(
                `https://${config.storageAccount}.blob.core.windows.net`,
                new StorageSharedKeyCredential(config.storageAccount, config.storageAccessKey)
            );
        }
        this.containerName = config.container;
        this.storageAccount = config.storageAccount;

        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    public async createContainerIfNotExists(context?: SpanContext): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.createContainerIfNotExists.name);

        try {
            const result = await this.client.createContainer(this.containerName);

            span.setTag(Tags.HTTP_STATUS_CODE, result.containerCreateResponse._response.status);
            this.metrics.increment(
                BlobMetrics.CreateContainer,
                this.generateMetricTags(
                    BlobMetricResults.Success,
                    result.containerCreateResponse._response.status
                )
            );

            return true;
        } catch (error) {
            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);

            // 409 is returned if a container exists
            if ((error as any).statusCode === 409) {
                this.metrics.increment(
                    BlobMetrics.CreateContainer,
                    this.generateMetricTags(BlobMetricResults.Success, (error as any).statusCode)
                );

                return false;
            }

            this.metrics.increment(
                BlobMetrics.CreateContainer,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async deleteContainerIfExists(context?: SpanContext): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.deleteContainerIfExists.name);

        try {
            const result = await this.client.deleteContainer(this.containerName);

            span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
            this.metrics.increment(
                BlobMetrics.DeleteContainer,
                this.generateMetricTags(BlobMetricResults.Success, result._response.status)
            );

            return true;
        } catch (error) {
            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);

            // 409 is returned if it doesnt exist
            if ((error as any).statusCode === 409) {
                this.metrics.increment(
                    BlobMetrics.DeleteContainer,
                    this.generateMetricTags(BlobMetricResults.Success, (error as any).statusCode)
                );
                return false;
            }

            this.metrics.increment(
                BlobMetrics.DeleteContainer,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async write(
        context: SpanContext,
        blobId: string,
        content: Buffer | string
    ): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.write.name);

        const blobClient = this.client
            .getContainerClient(this.containerName)
            .getBlockBlobClient(blobId);

        try {
            const result = await blobClient.upload(content, Buffer.byteLength(content));

            span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
            this.metrics.increment(
                BlobMetrics.Write,
                this.generateMetricTags(BlobMetricResults.Success, result._response.status)
            );
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.Write,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async readAsText(context: SpanContext, blobId: string): Promise<string> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.readAsText.name);

        try {
            const blobClient = this.client
                .getContainerClient(this.containerName)
                .getBlobClient(blobId);

            const result = await blobClient.download();

            this.metrics.increment(
                BlobMetrics.ReadAsText,
                this.generateMetricTags(BlobMetricResults.Success, result._response.status)
            );
            span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);

            return streamToString(result.readableStreamBody);
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.ReadAsText,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async exists(context: SpanContext, blobId: string): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.exists.name);

        try {
            const blobClient = this.client
                .getContainerClient(this.containerName)
                .getBlobClient(blobId);
            const exists = await blobClient.exists();

            this.metrics.increment(
                BlobMetrics.Exists,
                this.generateMetricTags(BlobMetricResults.Success, 200)
            );
            span.setTag(Tags.HTTP_STATUS_CODE, 200);

            return exists;
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.Exists,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async *listBlobs(context: SpanContext, prefix: string): AsyncIterableIterator<string> {
        const span: Span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.listBlobs.name);

        const containerClient = this.client.getContainerClient(this.containerName);
        const pagedIterator = await containerClient.listBlobsFlat({ prefix });

        try {
            for await (const item of pagedIterator) {
                this.metrics.increment(
                    BlobMetrics.ListBlobs,
                    this.generateMetricTags(BlobMetricResults.Success, 200)
                );

                yield item.name;
            }

            span.setTag(Tags.HTTP_STATUS_CODE, 200);
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.ListBlobs,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async deleteFolderIfExists(context: SpanContext, folderId: string): Promise<boolean> {
        const span: Span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.deleteFolderIfExists.name);

        try {
            const iterator = this.listBlobs(context, folderId);
            const deleteResults: boolean[] = [];
            for await (const blobId of iterator) {
                deleteResults.push(await this.deleteBlobIfExists(context, blobId));
            }

            span.setTag(Tags.HTTP_STATUS_CODE, 201);
            this.metrics.increment(
                BlobMetrics.DeleteFolder,
                this.generateMetricTags(BlobMetricResults.Success, 201)
            );

            return deleteResults.some((e) => e === true);
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.DeleteFolder,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    public async deleteBlobIfExists(context: SpanContext, blobId: string): Promise<boolean> {
        const span: Span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.deleteBlobIfExists.name);

        try {
            const blobClient = this.client
                .getContainerClient(this.containerName)
                .getBlobClient(blobId);
            const response = await blobClient.deleteIfExists();

            span.setTag(Tags.HTTP_STATUS_CODE, response._response.status);
            this.metrics.increment(
                BlobMetrics.DeleteBlob,
                this.generateMetricTags(BlobMetricResults.Success, response._response.status)
            );

            return response.succeeded;
        } catch (error) {
            this.metrics.increment(
                BlobMetrics.DeleteBlob,
                this.generateMetricTags(BlobMetricResults.Error, (error as any).statusCode)
            );

            span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
            failSpan(span, error);

            throw error;
        } finally {
            span.finish();
        }
    }

    private generateMetricTags(result: BlobMetricResults, statusCode?: number): IMetricTags {
        const tags: { [key: string]: any } = {
            container_name: this.containerName,
            storage_account: this.storageAccount,
            status_code: statusCode,
            result,
        };
        return tags;
    }

    private spanLogAndSetTags(span: Span, funcName: string): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-azure");
        span.setTag(Tags.DB_INSTANCE, this.storageAccount);
        span.setTag(Tags.DB_TYPE, "AzureBlobStorage");
        span.setTag(Tags.PEER_SERVICE, "AzureBlobStorage");
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(BlobOpenTracingTagKeys.ContainerName, this.containerName);
    }
}

enum BlobMetricResults {
    Success = "success",
    Error = "error",
}

export enum BlobOpenTracingTagKeys {
    ContainerName = "blob.container_name",
}

enum BlobMetrics {
    CreateContainer = "cookie_cutter.azure_blob_client.create_container",
    DeleteContainer = "cookie_cutter.azure_blob_client.delete_container",
    Write = "cookie_cutter.azure_blob_client.write",
    ReadAsText = "cookie_cutter.azure_blob_client.read_as_text",
    Exists = "cookie_cutter.azure_blob_client.exists",
    DeleteFolder = "cookie_cutter.azure_blob_client.delete_folder",
    DeleteBlob = "cookie_cutter.azure_blob_client.delete_blob",
    ListBlobs = "cookie_cutter.azure_blob_client.list_all_blobs",
}
