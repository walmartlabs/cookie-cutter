/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import {
    IKafkaBrokerConfiguration,
    IKafkaHeaderNames,
    IKafkaMessagePreprocessor,
    IKafkaPublisherConfiguration,
    IKafkaSubscriptionConfiguration,
    IKafkaTopic,
    KafkaMessagePublishingStrategy,
    KafkaOffsetResetStrategy,
    KafkaPublisherCompressionMode,
    IKafkaClientConfiguration,
} from ".";
import * as tls from "tls";

@config.section
export class KafkaClientConfiguration implements IKafkaClientConfiguration {
    @config.field(config.converters.timespan)
    public set connectionTimeout(_: number) {
        config.noop();
    }
    public get connectionTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set requestTimeout(_: number) {
        config.noop();
    }
    public get requestTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientIdPrefix(_: string) {
        config.noop();
    }
    public get clientIdPrefix(): string {
        return config.noop();
    }
}

@config.section
export class KafkaBrokerConfiguration
    extends KafkaClientConfiguration
    implements IKafkaBrokerConfiguration
{
    @config.field(config.converters.listOf(config.converters.string))
    public set broker(_: string | string[]) {
        config.noop();
    }
    public get broker(): string | string[] {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set headerNames(_: IKafkaHeaderNames) {
        config.noop();
    }
    public get headerNames(): IKafkaHeaderNames {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set ssl(_: tls.ConnectionOptions) {
        config.noop();
    }
    public get ssl(): tls.ConnectionOptions {
        return config.noop();
    }
}

@config.section
export class KafkaSubscriptionConfiguration
    extends KafkaBrokerConfiguration
    implements IKafkaSubscriptionConfiguration
{
    @config.field(config.converters.string)
    public set group(_: string) {
        config.noop();
    }
    public get group(): string {
        return config.noop();
    }

    @config.field(topicConverter)
    public set topics(_: string | (string | IKafkaTopic)[]) {
        config.noop();
    }
    public get topics(): string | (string | IKafkaTopic)[] {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set eos(_: boolean) {
        config.noop();
    }
    public get eos(): boolean {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set consumeTimeout(_: number) {
        config.noop();
    }
    public get consumeTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.bytes)
    public set maxBytesPerPartition(_: number) {
        config.noop();
    }
    public get maxBytesPerPartition(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set offsetCommitInterval(_: number) {
        config.noop();
    }
    public get offsetCommitInterval(): number {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set preprocessor(_: IKafkaMessagePreprocessor) {
        config.noop();
    }
    public get preprocessor(): IKafkaMessagePreprocessor {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set sessionTimeout(_: number) {
        config.noop();
    }
    public get sessionTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set additionalHeaderNames(_: { [key: string]: string }) {
        config.noop();
    }
    public get additionalHeaderNames(): { [key: string]: string } {
        return config.noop();
    }
}

@config.section
export class KafkaPublisherConfiguration
    extends KafkaBrokerConfiguration
    implements IKafkaPublisherConfiguration
{
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

    @config.field(config.converters.enum(KafkaMessagePublishingStrategy))
    public set messagePublishingStrategy(_: KafkaMessagePublishingStrategy) {
        config.noop();
    }
    public get messagePublishingStrategy(): KafkaMessagePublishingStrategy {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set transactionalId(_: string) {
        config.noop();
    }
    public get transactionalId(): string {
        return config.noop();
    }

    @config.field(config.converters.enum(KafkaPublisherCompressionMode))
    public set compressionMode(_: KafkaPublisherCompressionMode) {
        config.noop();
    }
    public get compressionMode(): KafkaPublisherCompressionMode {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientIdPrefix(_: string) {
        config.noop();
    }
    public get clientIdPrefix(): string {
        return config.noop();
    }
}

export function topicConverter(
    topicsConfiguration: string | (string | IKafkaTopic)[]
): IKafkaTopic[] {
    const topics = Array.isArray(topicsConfiguration)
        ? topicsConfiguration
        : topicsConfiguration.split(",");
    const result = new Array<IKafkaTopic>();
    for (const item of topics) {
        if (isKafkaTopicConfiguration(item)) {
            result.push({
                name: item.name,
                offsetResetStrategy: item.offsetResetStrategy || KafkaOffsetResetStrategy.Earliest,
            });
        } else {
            result.push(parseTopicString(item));
        }
    }

    return result;
}

function isKafkaTopicConfiguration(val: any): val is IKafkaTopic {
    return val.name !== undefined;
}

function parseTopicString(topic: string): IKafkaTopic {
    const [name, compactedOrStrategy] = topic.split("|").map((s) => s.trim());

    function map(key: string): KafkaOffsetResetStrategy {
        switch (key && key.toLowerCase()) {
            case "compacted":
            case "always-earliest":
                return KafkaOffsetResetStrategy.AlwaysEarliest;
            case "earliest":
                return KafkaOffsetResetStrategy.Earliest;
            case "latest":
                return KafkaOffsetResetStrategy.Latest;
            case "always-latest":
                return KafkaOffsetResetStrategy.AlwaysLatest;
        }

        return KafkaOffsetResetStrategy.Earliest;
    }

    return {
        name,
        offsetResetStrategy: map(compactedOrStrategy),
    };
}
