/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IOutputSink,
    IPublishedMessage,
    IRequireInitialization,
    IStoredMessage,
    IMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { BigQueryClient } from "./BigQueryClient";
import { BigQuerySink } from "./BigQuerySink";
export { BigQueryMetadata } from "./BigQuerySink";
import { BigQueryConfiguration, GCSConfiguration, PubSubPublisherConfiguration } from "./config";
import { GcsClient } from "./GcsClient";
import { GcsSink } from "./GcsSink";
import { PubSubSink } from "./PubSubSink";

export interface IGCSConfiguration {
    readonly projectId: string;
    readonly bucketId: string;
    readonly clientEmail: string;
    readonly privateKey: string;
}

export interface IBigQueryConfiguration {
    readonly projectId: string;
    readonly datasetId: string;
    readonly clientEmail: string;
    readonly privateKey: string;
}

export interface IGcpAuthConfiguration {
    readonly projectId: string;
    readonly clientEmail: string;
    readonly privateKey: string;
}

export interface IPubSubPublisherConfiguration {
    readonly encoder: IMessageEncoder;
    readonly defaultTopic?: string;
    readonly maximumBatchSize?: number;
    readonly maximumBatchWaitTime?: number;
    readonly maxPayloadSize?: number;
}

export interface IGcsClient {
    putObject(spanContext: SpanContext, body: Buffer, key: string): Promise<void>;
}

export interface IBigQueryClient {
    putObject(spanContext: SpanContext, body: any[] | any, table: string): Promise<void>;
}

export function gcsClient(configuration: IGCSConfiguration): IGcsClient & IRequireInitialization {
    configuration = config.parse(GCSConfiguration, configuration);
    return new GcsClient(configuration);
}

export function bigQueryClient(
    configuration: IBigQueryConfiguration
): IBigQueryClient & IRequireInitialization {
    configuration = config.parse(BigQueryConfiguration, configuration);
    return new BigQueryClient(configuration);
}

export function gcsSink(configuration: IGCSConfiguration): IOutputSink<IStoredMessage> {
    const config: IGCSConfiguration = {
        projectId: configuration.projectId,
        bucketId: configuration.bucketId,
        clientEmail: configuration.clientEmail,
        privateKey: configuration.privateKey,
    };
    return new GcsSink(gcsClient(config));
}

export function bigQuerySink(
    configuration: IBigQueryConfiguration,
    maxBatchSize: number = 100
): IOutputSink<IPublishedMessage> {
    const config: IBigQueryConfiguration = {
        projectId: configuration.projectId,
        datasetId: configuration.datasetId,
        clientEmail: configuration.clientEmail,
        privateKey: configuration.privateKey,
    };
    return new BigQuerySink(bigQueryClient(config), maxBatchSize);
}

export function pubSubSink(
    configuration: IGcpAuthConfiguration & IPubSubPublisherConfiguration
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(PubSubPublisherConfiguration, configuration, {
        maximumBatchSize: 1000,
        maximumBatchWaitTime: 100,
        maxPayloadSize: 5242880,
    });
    return new PubSubSink(configuration);
}
