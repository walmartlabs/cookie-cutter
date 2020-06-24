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
import { BlobServiceClient, ContainerCreateResponse } from "@azure/storage-blob";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IBlobStorageConfiguration } from "..";
import { Stream } from "stream";

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
    private options: any | undefined; // TODO revisit options

    constructor(config: IBlobStorageConfiguration) {
        this.containerName = config.container;
        this.storageAccount = config.storageAccount;
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${this.storageAccount};AccountKey=${config.storageAccessKey};EndpointSuffix=core.windows.net`;
        this.blobService = new BlobServiceClient(connectionString);
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        // explicitly setting options as undefined to avoid setting it to null which causes issues.
        this.options = config.requestTimeout
            ? { timeoutIntervalInMs: config.requestTimeout }
            : undefined;
        // TODO remove this logging statement, it's just for linting
        // tslint:disable-next-line: no-console
        console.log(this.options);
    }

    public async initialize(context: IComponentContext) {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    public async createContainerIfNotExists(context?: SpanContext) {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.createContainerIfNotExists.name);
        return new Promise<ContainerCreateResponse>((resolve, reject) => {
            this.blobService
                .createContainer(this.containerName)
                .then((result) => {
                    span.finish();
                    return resolve(result.containerCreateResponse);
                })
                .catch((error) => {
                    failSpan(span, error);
                    span.finish();
                    return reject(error);
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
        const containerClient = this.blobService.getContainerClient(this.containerName);
        const blobClient = containerClient.getBlockBlobClient(blobId);

        return new Promise<void>((resolve, reject) => {
            blobClient
                .upload(text, Buffer.byteLength(text))
                .then((result) => {
                    if (result && result._response && result._response.status) {
                        span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                    }
                    this.metrics.increment(
                        BlobMetrics.Write,
                        this.generateMetricTags(BlobMetricResults.Success, result._response.status)
                    );
                    span.finish();
                    resolve();
                })
                .catch((error) => {
                    span.setTag(Tags.HTTP_STATUS_CODE, error.statusCode);

                    this.metrics.increment(
                        BlobMetrics.Write,
                        this.generateMetricTags(BlobMetricResults.Error, error.statusCode)
                    );
                    failSpan(span, error);
                    span.finish();
                    reject(error);
                });
        });
    }

    public read(context: SpanContext, blobId: string): Promise<string> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.read.name);
        return new Promise<string>((resolve, reject) => {
            const blobClient = this.blobService
                .getContainerClient(this.containerName)
                .getBlobClient(blobId);

            blobClient
                .download()
                .then((result) => {
                    if (result && result._response && result._response.status) {
                        span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                    }

                    this.metrics.increment(
                        BlobMetrics.Read,
                        this.generateMetricTags(BlobMetricResults.Success, result._response.status)
                    );
                    span.finish();

                    resolve(this.streamToString(result.readableStreamBody));
                })
                .catch((error) => {
                    span.setTag(Tags.HTTP_STATUS_CODE, error.statusCode);

                    this.metrics.increment(
                        BlobMetrics.Read,
                        this.generateMetricTags(BlobMetricResults.Error, error.statusCode)
                    );
                    failSpan(span, error);
                    span.finish();
                    reject(error);
                });
        });
    }

    public exists(context: SpanContext, blobId: string): Promise<boolean> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.exists.name);

        const containers = this.blobService.listContainers();

        return new Promise<boolean>((resolve, reject) => {
            containers
                .next()
                .then((container) => {
                    if (container.value.name === blobId) {
                        this.metrics.increment(
                            BlobMetrics.Exists,
                            this.generateMetricTags(BlobMetricResults.Success, 200)
                        );
                        return resolve(true);
                    }
                })
                .catch((error) => {
                    span.setTag(Tags.HTTP_STATUS_CODE, error.statusCode);

                    this.metrics.increment(
                        BlobMetrics.Exists,
                        this.generateMetricTags(BlobMetricResults.Error, error.statusCode)
                    );
                    failSpan(span, error);
                    span.finish();
                    reject(error);
                });
        });
    }

    private async streamToString(readableStream: Stream): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const chunks = [];
            readableStream.on("data", (data) => {
                chunks.push(data.toString());
            });
            readableStream.on("end", () => {
                resolve(chunks.join(""));
            });
            readableStream.on("error", reject);
        });
    }
}
