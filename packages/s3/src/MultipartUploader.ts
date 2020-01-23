/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    failSpan,
    IMessage,
    IMessageEncoder,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import * as AWS from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { S3OpenTracingTagKeys } from "./S3Client";

export interface IMultipartUploader<T> {
    send(data: T): Promise<void>;
    complete(): Promise<void>;
}

export class MultipartUploader<T> implements IMultipartUploader<T> {
    private uploadIdCounter: number = 0;
    private uploadIdFinishedParts: AWS.S3.CompletedPart[] = new Array();
    private spanOperationName: string = "S3 MultipartUploader Client Call";

    public constructor(
        private readonly client: AWS.S3,
        private encoder: IMessageEncoder,
        private endpoint: string,
        private type: string,
        private bucket: string,
        private key: string,
        private uploadId: string,
        private tracer: Tracer,
        private context: SpanContext
    ) {}

    public async send(data: T): Promise<void> {
        await this.uploadPart(data);
    }

    public async complete(): Promise<void> {
        await this.completeMultipartUpload();
    }

    private spanLogAndSetTags(span: Span, funcName: string): void {
        span.log({ bucket: this.bucket, key: this.key, uploadId: this.uploadId });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-s3");
        span.setTag(Tags.DB_INSTANCE, this.bucket);
        span.setTag(Tags.DB_TYPE, AWS.S3.name);
        span.setTag(Tags.PEER_ADDRESS, this.endpoint);
        span.setTag(Tags.PEER_SERVICE, AWS.S3.name);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(S3OpenTracingTagKeys.BucketName, this.bucket);
    }

    private async uploadPart<T>(body: T): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: this.context });
        this.spanLogAndSetTags(span, this.uploadPart.name);
        const msg: IMessage = {
            type: this.type,
            payload: body,
        };

        const encodedBody = Buffer.from(this.encoder.encode(msg));
        try {
            const partNumber = this.uploadIdCounter + 1;
            this.uploadIdCounter = partNumber;
            const params: AWS.S3.Types.UploadPartRequest = {
                Body: encodedBody,
                Bucket: this.bucket,
                Key: this.key,
                UploadId: this.uploadId,
                PartNumber: partNumber,
            };
            const req = await this.client.uploadPart(params).promise();
            if (req.$response.error) {
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
            const completedPart: AWS.S3.CompletedPart = {
                PartNumber: partNumber,
            };
            if (req.$response.data && req.$response.data.ETag) {
                completedPart.ETag = req.$response.data.ETag;
            } else {
                throw new Error(`no eTag returned from uploadPart request: ${req.$response.data}}`);
            }
            this.uploadIdFinishedParts.push(completedPart);
        } catch (e) {
            failSpan(span, e);
            throw e;
        } finally {
            span.finish();
        }
    }

    private async completeMultipartUpload(): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: this.context });
        this.spanLogAndSetTags(span, this.completeMultipartUpload.name);

        let req: PromiseResult<AWS.S3.CompleteMultipartUploadOutput, AWS.AWSError>;
        try {
            const params: AWS.S3.Types.CompleteMultipartUploadRequest = {
                Bucket: this.bucket,
                Key: this.key,
                UploadId: this.uploadId,
                MultipartUpload: { Parts: this.uploadIdFinishedParts },
            };
            req = await this.client.completeMultipartUpload(params).promise();
            if (req.$response.error) {
                throw new Error(
                    `code: ${req.$response.error.code}, message: ${req.$response.error.message}`
                );
            }
        } catch (e) {
            failSpan(span, e);
            throw e;
        } finally {
            if (req) {
                span.setTag(Tags.HTTP_STATUS_CODE, req.$response.httpResponse.statusCode);
            }
            span.finish();
        }
    }
}
