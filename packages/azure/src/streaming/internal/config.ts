/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import {
    IQueueConfiguration,
    IQueueMessagePreprocessor,
    IQueueSourceConfiguration,
    IDeadLetterQueueConfiguration,
} from "..";

@config.section
export class DeadLetterQueueConfiguration implements IDeadLetterQueueConfiguration {
    @config.field(config.converters.string)
    public set queueName(_: string) {
        config.noop();
    }
    public get queueName(): string {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set maxDequeueCount(_: number) {
        config.noop();
    }
    public get maxDequeueCount(): number {
        return config.noop();
    }

    @config.field(
        config.converters.timespanOf(
            config.TimeSpanTargetUnit.Seconds,
            config.TimeSpanTargetUnit.Seconds
        )
    )
    public set visibilityTimeout(_: number) {
        config.noop();
    }
    public get visibilityTimeout(): number {
        return config.noop();
    }

    @config.field(
        config.converters.timespanOf(
            config.TimeSpanTargetUnit.Seconds,
            config.TimeSpanTargetUnit.Seconds
        )
    )
    public set messageTimeToLive(_: number) {
        config.noop();
    }
    public get messageTimeToLive(): number {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set retryCount(_: number) {
        config.noop();
    }
    public get retryCount(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set retryInterval(_: number) {
        config.noop();
    }
    public get retryInterval(): number {
        return config.noop();
    }
}

@config.section
export class QueueConfiguration implements IQueueConfiguration {
    @config.field(config.converters.string)
    public set url(_: string) {
        config.noop();
    }
    public get url(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set storageAccount(_: string) {
        config.noop();
    }
    public get storageAccount(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set storageAccessKey(_: string) {
        config.noop();
    }
    public get storageAccessKey(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set queueName(_: string) {
        config.noop();
    }
    public get queueName(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set connectionString(_: string) {
        config.noop();
    }
    public get connectionString(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set preprocessor(_: IQueueMessagePreprocessor) {
        config.noop();
    }
    public get preprocessor(): IQueueMessagePreprocessor {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set retryCount(_: number) {
        config.noop();
    }
    public get retryCount(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set retryInterval(_: number) {
        config.noop();
    }
    public get retryInterval(): number {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set largeItemBlobContainer(_: string) {
        config.noop();
    }
    public get largeItemBlobContainer(): string {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set createQueueIfNotExists(_: boolean) {
        config.noop();
    }
    public get createQueueIfNotExists(): boolean {
        return config.noop();
    }
}

@config.section
export class QueueSourceConfiguration
    extends QueueConfiguration
    implements IQueueSourceConfiguration
{
    @config.field(config.converters.number)
    public set numOfMessages(_: number) {
        config.noop();
    }
    public get numOfMessages(): number {
        return config.noop();
    }

    @config.field(
        config.converters.timespanOf(
            config.TimeSpanTargetUnit.Seconds,
            config.TimeSpanTargetUnit.Seconds
        )
    )
    public set visibilityTimeout(_: number) {
        config.noop();
    }
    public get visibilityTimeout(): number {
        return config.noop();
    }

    @config.field<IDeadLetterQueueConfiguration>(DeadLetterQueueConfiguration)
    public set deadLetterQueue(_: IDeadLetterQueueConfiguration) {
        config.noop();
    }
    public get deadLetterQueue(): IDeadLetterQueueConfiguration {
        return config.noop();
    }
}
