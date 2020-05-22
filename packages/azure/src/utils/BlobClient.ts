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
import { BlobService, createBlobService, ServiceResponse } from "azure-storage";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IBlobStorageConfiguration } from "..";

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
    private blobService: BlobService;
    private containerName: string;
    private storageAccount: string;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName = "Azure Blob Client Call";
    private options: BlobService.CreateBlobRequestOptions | undefined;

    constructor(config: IBlobStorageConfiguration) {
        this.containerName = config.container;
        this.storageAccount = config.storageAccount;
        this.blobService = createBlobService(
            config.storageAccount,
            config.storageAccessKey,
            config.url
        );
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        // explicitly setting options as undefined to avoid setting it to null which causes issues.
        this.options = config.requestTimeout
            ? { timeoutIntervalInMs: config.requestTimeout }
            : undefined;
    }

    public async initialize(context: IComponentContext) {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    public async createContainerIfNotExists(context?: SpanContext) {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.createContainerIfNotExists.name);
        return new Promise<BlobService.ContainerResult>((resolve, reject) => {
            this.blobService.createContainerIfNotExists(this.containerName, (error, result) => {
                if (error) {
                    failSpan(span, error);
                    span.finish();
                    return reject(error);
                }
                span.finish();
                return resolve(result);
            });
        });
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

    public write(context: SpanContext, text: Buffer | string, blobId: string): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.write.name);
        return new Promise<void>((resolve, reject) => {
            this.blobService.createBlockBlobFromText(
                this.containerName,
                blobId,
                text,
                this.options,
                (err: Error, _: BlobService.BlobResult, response: ServiceResponse) => {
                    const statusCode = response && response.statusCode;
                    if (statusCode !== undefined) {
                        span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                    }

                    if (err) {
                        this.metrics.increment(
                            BlobMetrics.Write,
                            this.generateMetricTags(BlobMetricResults.Error, statusCode)
                        );
                        failSpan(span, err);
                        span.finish();
                        reject(err);
                    } else {
                        this.metrics.increment(
                            BlobMetrics.Write,
                            this.generateMetricTags(BlobMetricResults.Success, statusCode)
                        );
                        span.finish();
                        resolve();
                    }
                }
            );
        });
    }

    public read(context: SpanContext, blobId: string): Promise<string> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.read.name);
        return new Promise<string>((resolve, reject) => {
            this.blobService.getBlobToText(
                this.containerName,
                blobId,
                undefined,
                (
                    err: Error,
                    text: string,
                    _: BlobService.BlobResult,
                    response: ServiceResponse
                ) => {
                    const statusCode = response && response.statusCode;
                    if (statusCode !== undefined) {
                        span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                    }

                    if (err) {
                        this.metrics.increment(
                            BlobMetrics.Read,
                            this.generateMetricTags(BlobMetricResults.Error, statusCode)
                        );
                        failSpan(span, err);
                        span.finish();
                        reject(err);
                    } else {
                        this.metrics.increment(
                            BlobMetrics.Read,
                            this.generateMetricTags(BlobMetricResults.Success, statusCode)
                        );
                        span.finish();
                        resolve(text);
                    }
                }
            );
        });
    }

    public exists(context: SpanContext, blobId: string): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.exists.name);
        return new Promise((resolve, reject) => {
            this.blobService.doesBlobExist(
                this.containerName,
                blobId,
                (err: Error, result: BlobService.BlobResult, response: ServiceResponse) => {
                    const statusCode = response && response.statusCode;
                    if (statusCode !== undefined) {
                        span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                    }

                    if (err) {
                        this.metrics.increment(
                            BlobMetrics.Exists,
                            this.generateMetricTags(BlobMetricResults.Error, statusCode)
                        );
                        failSpan(span, err);
                        span.finish();
                        reject(err);
                    } else {
                        this.metrics.increment(
                            BlobMetrics.Exists,
                            this.generateMetricTags(BlobMetricResults.Success, statusCode)
                        );
                        span.finish();
                        resolve(result.exists);
                    }
                }
            );
        });
    }
}
