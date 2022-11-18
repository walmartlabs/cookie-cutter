/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Bucket, Storage } from "@google-cloud/storage";
import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IMetrics,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { Readable } from "stream";
import { IGcsClient, IGCSConfiguration } from ".";

enum GCSMetrics {
    PutObject = "cookie_cutter.gcs_client.put_object",
    PutStream = "cookie_cutter.gcs_client.put_stream",
}

enum GCSMetricResults {
    Success = "success",
    Error = "error",
}

export enum GCSOpenTracingTagKeys {
    BucketName = "gcs.bucket",
}

export class GcsClient implements IGcsClient, IRequireInitialization {
    private bucket: Bucket;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "GCS Client Call";

    constructor(private readonly config: IGCSConfiguration) {
        const key = this.config.privateKey.split("\\n").join("\n");
        this.bucket = new Storage({
            projectId: this.config.projectId,
            credentials: {
                client_email: this.config.clientEmail,
                private_key: key,
            },
        }).bucket(this.config.bucketId);
        this.tracer = DefaultComponentContext.tracer;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    private spanLogAndSetTags(span: Span, funcName: string, bucket: string, key: string): void {
        span.log({ bucket, key });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-gcs");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(GCSOpenTracingTagKeys.BucketName, bucket);
    }

    public async putObject(context: SpanContext, body: Buffer, key: string): Promise<void> {
        const bucket = this.config.bucketId;
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, bucket, key);
        try {
            await this.bucket.file(key).save(body);
            this.metrics.increment(GCSMetrics.PutObject, {
                bucket,
                result: GCSMetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(GCSMetrics.PutObject, {
                bucket,
                result: GCSMetricResults.Error,
            });
            throw e;
        } finally {
            span.finish();
        }
    }

    public async putObjectAsStream(
        context: SpanContext,
        stream: Readable,
        key: string
    ): Promise<void> {
        const bucket = this.config.bucketId;
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, bucket, key);
        const streamFileUpload = async (): Promise<void> => {
            return new Promise((resolve, reject) => {
                stream
                    .pipe(this.bucket.file(key).createWriteStream())
                    .on("finish", () => {
                        this.metrics.increment(GCSMetrics.PutStream, {
                            bucket,
                            result: GCSMetricResults.Success,
                        });
                        resolve();
                    })
                    .on("error", (error) => {
                        reject(error.stack);
                    });
            });
        };
        try {
            await streamFileUpload();
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(GCSMetrics.PutStream, {
                bucket,
                result: GCSMetricResults.Error,
            });
            throw e;
        } finally {
            span.finish();
        }
    }
}
