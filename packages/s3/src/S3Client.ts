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
import * as AWS from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { isString } from "util";
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
    private readonly client: AWS.S3;
    private encoder: IMessageEncoder;
    private typeMapper: IMessageTypeMapper;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "S3 Client Call";

    constructor(private readonly config: IS3Configuration & IS3PublisherConfiguration) {
        this.client = new AWS.S3({
            endpoint: this.config.endpoint,
            credentials: new AWS.Credentials({
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            }),
            sslEnabled: this.config.sslEnabled,
            s3BucketEndpoint: false,
            apiVersion: this.config.apiVersion,
            s3ForcePathStyle: true,
            httpOptions: {
                timeout: this.config.timeout,
            },
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
        span.setTag(Tags.DB_TYPE, AWS.S3.name);
        span.setTag(Tags.PEER_ADDRESS, this.config.endpoint);
        span.setTag(Tags.PEER_SERVICE, AWS.S3.name);
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
        let req: PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>;
        let errorCode;
        let statusCode;
        try {
            const params: AWS.S3.Types.PutObjectRequest = {
                Body: encodedBody,
                Bucket: bucket,
                Key: key,
                Metadata: { [S3Metadata.Type]: msg.type },
            };
            req = await this.client.putObject(params).promise();
            if (req.$response.error) {
                errorCode = req.$response.error.code;
                statusCode = req.$response.error.statusCode;
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
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
                error_code: errorCode,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (req) {
                span.setTag(Tags.HTTP_STATUS_CODE, req.$response.httpResponse.statusCode);
            }
            span.finish();
        }
    }

    public async getObject<T>(context: SpanContext, bucket: string, key: string): Promise<T> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.getObject.name, bucket, key);

        let req: PromiseResult<AWS.S3.GetObjectOutput, AWS.AWSError>;
        let errorCode;
        let statusCode;
        try {
            req = await this.client
                .getObject({
                    Bucket: bucket,
                    Key: key,
                })
                .promise();
            if (req.$response.error) {
                errorCode = req.$response.error.code;
                statusCode = req.$response.error.statusCode;
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
            let data: T;
            let type;
            if (req.$response.data && req.$response.data.Metadata) {
                type = req.$response.data.Metadata[S3Metadata.Type];
            }
            if (req.$response.data && req.$response.data.Body) {
                const msg = this.encoder.decode(req.$response.data.Body as Buffer, type);
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
                error_code: errorCode,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (req) {
                span.setTag(Tags.HTTP_STATUS_CODE, req.$response.httpResponse.statusCode);
            }
            span.finish();
        }
    }

    public async deleteObject(context: SpanContext, bucket: string, key: string): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.deleteObject.name, bucket, key);

        let req: PromiseResult<AWS.S3.DeleteObjectOutput, AWS.AWSError>;
        let errorCode;
        let statusCode;
        try {
            req = await this.client
                .deleteObject({
                    Bucket: bucket,
                    Key: key,
                })
                .promise();

            if (req.$response.error) {
                errorCode = req.$response.error.code;
                statusCode = req.$response.error.statusCode;
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
            this.metrics.increment(S3Metrics.Delete, {
                bucket,
                result: S3MetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.Delete, {
                bucket,
                result: S3MetricResults.Error,
                error_code: errorCode,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (req) {
                span.setTag(Tags.HTTP_STATUS_CODE, req.$response.httpResponse.statusCode);
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

        let req: PromiseResult<AWS.S3.CreateMultipartUploadOutput, AWS.AWSError>;
        const typeName = this.getTypeName(type);
        let errorCode;
        let statusCode;
        try {
            req = await this.client
                .createMultipartUpload({
                    Bucket: bucket,
                    Key: key,
                    Metadata: { [S3Metadata.Type]: typeName },
                })
                .promise();

            if (req.$response.error) {
                errorCode = req.$response.error.code;
                statusCode = req.$response.error.statusCode;
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
            if (req.$response.data && req.$response.data.UploadId) {
                const uploadId = req.$response.data.UploadId;
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
                    uploadId,
                    this.tracer,
                    span.context()
                );
            } else {
                throw new Error(
                    `no uploadId returned in multipart upload request, data: ${req.$response.data}}`
                );
            }
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(S3Metrics.MultipartUpload, {
                type,
                bucket,
                result: S3MetricResults.Error,
                error_code: errorCode,
                status_code: statusCode,
            });
            throw e;
        } finally {
            if (req) {
                span.setTag(Tags.HTTP_STATUS_CODE, req.$response.httpResponse.statusCode);
            }
            span.finish();
        }
    }

    public createPresignedReadOnlyUrl(bucket: string, key: string, expiryMs: number): string {
        return this.client.getSignedUrl("getObject", {
            Bucket: bucket,
            Key: key,
            Expires: expiryMs,
        });
    }
}
