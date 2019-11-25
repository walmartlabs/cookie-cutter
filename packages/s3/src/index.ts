/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IClassType,
    IMessageEncoder,
    IMessageTypeMapper,
    IOutputSink,
    IPublishedMessage,
    IRequireInitialization,
    NullMessageEncoder,
    ObjectNameMessageTypeMapper,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { S3Configuration, S3PublisherConfiguration } from "./config";
import { IMultipartUploader } from "./MultipartUploader";
import { S3Client } from "./S3Client";
import { S3Sink } from "./S3Sink";

export { IMultipartUploader } from "./MultipartUploader";

export enum S3Metadata {
    Key = "s3.key",
    Bucket = "s3.bucket",
    Type = "s3.type",
}

export interface IS3Configuration {
    readonly endpoint: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly encoder?: IMessageEncoder;
    readonly typeMapper?: IMessageTypeMapper;
    readonly sslEnabled?: boolean;
    readonly apiVersion?: string;
    // the timeout before the connection will be closed. defaults to undefined
    readonly timeout?: number;
}

export interface IS3PublisherConfiguration {
    readonly defaultBucket?: string;
}

export function s3Sink(
    configuration: IS3Configuration & IS3PublisherConfiguration
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(S3PublisherConfiguration, configuration, {
        sslEnabled: false,
        apiVersion: "2006-03-01",
        encoder: new NullMessageEncoder(),
        typeMapper: new ObjectNameMessageTypeMapper(),
        timeout: undefined,
    });
    return new S3Sink(configuration, new S3Client(configuration));
}

export interface IS3Client {
    getObject<T>(spanContext: SpanContext, bucket: string, key: string): Promise<T>;
    putObject<T>(
        spanContext: SpanContext,
        type: string | IClassType<T>,
        body: T,
        bucket: string,
        key: string
    ): Promise<void>;
    deleteObject(spanContext: SpanContext, bucket: string, key: string): Promise<void>;
    multipartUpload<T>(
        spanContext: SpanContext,
        type: string | IClassType<T>,
        bucket: string,
        key: string
    ): Promise<IMultipartUploader<T>>;
    createPresignedReadOnlyUrl(bucket: string, key: string, expiryMs: number): string;
}

export function s3Client(configuration: IS3Configuration): IS3Client & IRequireInitialization {
    configuration = config.parse(S3Configuration, configuration, {
        sslEnabled: false,
        apiVersion: "2006-03-01",
        encoder: new NullMessageEncoder(),
        typeMapper: new ObjectNameMessageTypeMapper(),
        timeout: undefined,
    });
    return new S3Client(configuration);
}
