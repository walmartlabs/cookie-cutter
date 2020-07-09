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
import { BlobServiceClient } from "@azure/storage-blob";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IBlobStorageConfiguration } from "..";
import { streamToString } from "./helpers";

export enum BlobOpenTracingTagKeys {
    ContainerName = "blob.container_name",
}

enum BlobMetrics {
    Write = "cookie_cutter.azure_blob_client.write",
    Read = "cookie_cutter.azure_blob_client.read",
    Exists = "cookie_cutter.azure_blob_client.exists",
}

enum BlobMetricResults {
    Success = "success",
    Error = "error",
}

export class BlobClient implements IRequireInitialization {
    private blobService: BlobServiceClient;
    private containerName: string;
    private storageAccount: string;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName = "Azure Blob Client Call";

    constructor(config: IBlobStorageConfiguration) {
        this.containerName = config.container;
        this.storageAccount = config.storageAccount;
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${this.storageAccount};AccountKey=${config.storageAccessKey};EndpointSuffix=core.windows.net`;
        this.blobService = new BlobServiceClient(connectionString);
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(context: IComponentContext) {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    public async createContainerIfNotExists(context?: SpanContext) {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.createContainerIfNotExists.name);

        try {
            const result = await this.blobService.createContainer(this.containerName);
            span.finish();
            return Promise.resolve(result.containerCreateResponse)
        } catch (err) {
            failSpan(span, err);
            span.finish();
            return Promise.reject(err);
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

    public async write(context: SpanContext, text: Buffer | string, blobId: string): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.write.name);
        const containerClient = this.blobService.getContainerClient(this.containerName);
        const blobClient = containerClient.getBlockBlobClient(blobId);

        try {
            const result = await blobClient.upload(text, Buffer.byteLength(text));

            if (result?._response?.status) {
                span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
            }
            this.metrics.increment(
                BlobMetrics.Write,
                this.generateMetricTags(BlobMetricResults.Success, result._response.status)
            );
            span.finish();
            return Promise.resolve();
        } catch (err) {
            span.setTag(Tags.HTTP_STATUS_CODE, err.statusCode);

            this.metrics.increment(
                BlobMetrics.Write,
                this.generateMetricTags(BlobMetricResults.Error, err.statusCode)
            );
            failSpan(span, err);
            span.finish();
            return Promise.reject(err);
        }
    }

    public async read(context: SpanContext, blobId: string): Promise<string> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.read.name);

        try {
            const blobClient = this.blobService
                .getContainerClient(this.containerName)
                .getBlobClient(blobId);

            const result = await blobClient.download();

            if (result?._response?.status) {
                span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
            }

            this.metrics.increment(
                BlobMetrics.Read,
                this.generateMetricTags(BlobMetricResults.Success, result._response.status)
            );
            span.finish();

            return Promise.resolve(streamToString(result.readableStreamBody));
            
        } catch (err) {
            span.setTag(Tags.HTTP_STATUS_CODE, err.statusCode);

            this.metrics.increment(
                BlobMetrics.Read,
                this.generateMetricTags(BlobMetricResults.Error, err.statusCode)
            );
            failSpan(span, err);
            span.finish();
            return Promise.reject(err);
        }
    }

    public async exists(context: SpanContext, blobId: string): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.exists.name);

        try {
            const containers = this.blobService.listContainers();
            let containerItem = await containers.next();
            while (!containerItem.done) {
                if (containerItem?.value.name === blobId) {
                    this.metrics.increment(
                        BlobMetrics.Exists,
                        this.generateMetricTags(BlobMetricResults.Success, 200)
                    );
                    return Promise.resolve(true);
                }
                containerItem = await containers.next();
            }
            this.metrics.increment(
                BlobMetrics.Exists,
                this.generateMetricTags(BlobMetricResults.Error, 404)
            );
            return Promise.resolve(false);
        } catch (err) {
            span.setTag(Tags.HTTP_STATUS_CODE, err.statusCode);

            this.metrics.increment(
                BlobMetrics.Exists,
                this.generateMetricTags(BlobMetricResults.Error, err.statusCode)
            );
            failSpan(span, err);
            span.finish();
            return Promise.reject(err);
        }
    }
}
