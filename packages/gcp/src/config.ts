/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import {
    IBigQueryConfiguration,
    IGCSConfiguration,
    IGcpAuthConfiguration,
    IPubSubPublisherConfiguration,
    IPubSubSubscriberConfiguration,
    IPubSubMessagePreprocessor,
} from ".";

@config.section
export class GCSConfiguration implements IGCSConfiguration {
    @config.field(config.converters.string)
    public set projectId(_: string) {
        config.noop();
    }
    public get projectId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set bucketId(_: string) {
        config.noop();
    }
    public get bucketId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientEmail(_: string) {
        config.noop();
    }
    public get clientEmail(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
}

@config.section
export class BigQueryConfiguration implements IBigQueryConfiguration {
    @config.field(config.converters.string)
    public set projectId(_: string) {
        config.noop();
    }
    public get projectId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set datasetId(_: string) {
        config.noop();
    }
    public get datasetId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientEmail(_: string) {
        config.noop();
    }
    public get clientEmail(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
}

@config.section
export class GcpAuthConfiguration implements IGcpAuthConfiguration {
    @config.field(config.converters.string)
    public set projectId(_: string) {
        config.noop();
    }
    public get projectId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientEmail(_: string) {
        config.noop();
    }
    public get clientEmail(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
}

@config.section
export class PubSubPublisherConfiguration
    extends GcpAuthConfiguration
    implements IPubSubPublisherConfiguration
{
    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set defaultTopic(_: string) {
        config.noop();
    }
    public get defaultTopic(): string {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set maximumBatchSize(_: number) {
        config.noop();
    }
    public get maximumBatchSize(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set maximumBatchWaitTime(_: number) {
        config.noop();
    }
    public get maximumBatchWaitTime(): number {
        return config.noop();
    }

    @config.field(config.converters.bytes)
    public set maxPayloadSize(_: number) {
        config.noop();
    }
    public get maxPayloadSize(): number {
        return config.noop();
    }
}

@config.section
export class PubSubSubscriberConfiguration
    extends GcpAuthConfiguration
    implements IPubSubSubscriberConfiguration
{
    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set subscriptionName(_: string) {
        config.noop();
    }
    public get subscriptionName(): string {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set maxMsgBatchSize(_: number) {
        config.noop();
    }
    public get maxMsgBatchSize(): number {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set preprocessor(_: IPubSubMessagePreprocessor) {
        config.noop();
    }
    public get preprocessor(): IPubSubMessagePreprocessor {
        return config.noop();
    }
}
