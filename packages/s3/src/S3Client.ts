/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    failSpan,
    IClassType,
    IComponentContext,
    IMessage,
    IMessageEncoder,
    IMessageTypeMapper,
    IMetrics,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import {
    S3Client as AwsS3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { isString } from "@walmartlabs/cookie-cutter-core";
import {
    IMultipartUploader,
    IS3Client,
    IS3Configuration,
    IS3PublisherConfiguration,
    S3Metadata,
} from ".";
import { MultipartUploader } from "./MultipartUploader";

enum S3Metrics {
    Get = "cookie_cutter.s3_client.get",
    Put = "cookie_cutter.s3_client.put",
    Delete = "cookie_cutter.s3_client.delete",
    MultipartUpload = "cookie_cutter.s3_client.multipart_upload",
}

enum S3MetricResults {
    Success = "success",
    Error = "error",
}

export enum S3OpenTracingTagKeys {
    BucketName = "s3.bucket",
}

export class S3Client implements IS3Client, IRequireInitialization {
    private readonly client: AwsS3Client;
    private encoder: IMessageEncoder;
    private typeMapper: IMessageTypeMapper;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "S3 Client Call";

    constructor(private readonly config: IS3Configuration & IS3PublisherConfiguration) {
        this.client = new AwsS3Client({
            endpoint: this.config.endpoint,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
            tls: this.config.sslEnabled,
            forcePathStyle: true,
            region: "us-east-1",
            requestHandler: this.config.timeout
                ? { requestTimeout: this.config.timeout }
                : undefined,
        });
        this.encoder = config.encoder;
        this.typeMapper = config.typeMapper;
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
    }

    private getTypeName<T>(type: string | IClassType<T>): string {
        let typeName: string;
        if (!isString(type)) {
            typeName = this.typeMapper.map(type);
        } else {
            typeName = type;
        }
        return typeName;
    }

    private spanLogAndSetTags(span: Span, funcName: string, bucket: string, key: string): void {
        span.log({ bucket, key });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-s3");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(Tags.DB_TYPE, "S3");
        span.setTag(Tags.PEER_ADDRESS, this.config.endpoint);
        span.setTag(Tags.PEER_SERVICE, "S3");
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(S3OpenTracingTagKeys.BucketName, bucket);
    }

    public async putObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        body: T,
        bucket: string,
        key: string
    ): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, bucket, key);
        const typeName = this.getTypeName(type);
        const msg: IMessage = {
            type: typeName,
            payload: body,
        };

        const encodedBody = Buffer.from(this.encoder.encode(msg));
        let statusCode: number | undefined;
        try {
            const result = await this.client.send(
                new PutObjectCommand({
                    Body: encodedBody,
                    Bucket: bucket,
                    Key: key,
                    Metadata: { [S3Metadata.Type]: msg.type },
                })
            );
            statusCode = result.$metadata.httpStatusCode;
            this.metrics.increment(S3Metrics.Put, {
                type,
                bucket,
                result: S3MetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.Put, {
                type,
                bucket,
                result: S3MetricResults.Error,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (statusCode !== undefined) {
                span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
            }
            span.finish();
        }
    }

    public async getObject<T>(context: SpanContext, bucket: string, key: string): Promise<T> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.getObject.name, bucket, key);

        let statusCode: number | undefined;
        try {
            const result = await this.client.send(
                new GetObjectCommand({
                    Bucket: bucket,
                    Key: key,
                })
            );
            statusCode = result.$metadata.httpStatusCode;

            let data: T;
            let type: string | undefined;
            if (result.Metadata) {
                type = result.Metadata[S3Metadata.Type];
            }
            if (result.Body) {
                const bodyBytes = await result.Body.transformToByteArray();
                const msg = this.encoder.decode(bodyBytes, type);
                data = msg.payload;
            }
            this.metrics.increment(S3Metrics.Get, {
                type,
                bucket,
                result: S3MetricResults.Success,
            });
            return data;
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.Get, {
                bucket,
                result: S3MetricResults.Error,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (statusCode !== undefined) {
                span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
            }
            span.finish();
        }
    }

    public async deleteObject(context: SpanContext, bucket: string, key: string): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.deleteObject.name, bucket, key);

        let statusCode: number | undefined;
        try {
            const result = await this.client.send(
                new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: key,
                })
            );
            statusCode = result.$metadata.httpStatusCode;
            this.metrics.increment(S3Metrics.Delete, {
                bucket,
                result: S3MetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.Delete, {
                bucket,
                result: S3MetricResults.Error,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (statusCode !== undefined) {
                span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
            }
            span.finish();
        }
    }

    public async multipartUpload<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        bucket: string,
        key: string
    ): Promise<IMultipartUploader<T>> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.multipartUpload.name, bucket, key);

        const typeName = this.getTypeName(type);
        let statusCode: number | undefined;
        try {
            const result = await this.client.send(
                new CreateMultipartUploadCommand({
                    Bucket: bucket,
                    Key: key,
                    Metadata: { [S3Metadata.Type]: typeName },
                })
            );
            statusCode = result.$metadata.httpStatusCode;

            if (!result.UploadId) {
                throw new Error(`no uploadId returned in multipart upload request`);
            }

            this.metrics.increment(S3Metrics.MultipartUpload, {
                type,
                bucket,
                result: S3MetricResults.Success,
            });
            return new MultipartUploader<T>(
                this.client,
                this.encoder,
                this.config.endpoint,
                typeName,
                bucket,
                key,
                result.UploadId,
                this.tracer,
                span.context()
            );
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.MultipartUpload, {
                type,
                bucket,
                result: S3MetricResults.Error,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (statusCode !== undefined) {
                span.setTag(Tags.HTTP_STATUS_CODE, statusCode);
            }
            span.finish();
        }
    }

    public async createPresignedReadOnlyUrl(
        bucket: string,
        key: string,
        expiryMs: number
    ): Promise<string> {
        return getSignedUrl(
            this.client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: Math.floor(expiryMs / 1000) }
        );
    }
}
