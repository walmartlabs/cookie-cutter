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
    IInputSource,
    IMessage,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { generate } from "shortid";

import { RedisOptions } from "./config";
import { RedisClient, IPelResult } from "./RedisClient";
import { RedisStreamSink } from "./RedisStreamSink";
import { RedisStreamSource } from "./RedisStreamSource";

export interface IRedisOptions {
    readonly host: string;
    readonly port: number;
    readonly db: number;
    readonly encoder: IMessageEncoder;
    readonly typeMapper: IMessageTypeMapper;
    readonly base64Encode?: boolean;
}

export type IRedisInputStreamOptions = IRedisOptions & {
    readonly readStream: string;
    readonly consumerGroup: string;
    readonly consumerId?: string;
    readonly consumerGroupStartId?: string;
    readonly blockTimeout?: number;
    readonly idleTimeout?: number;
    readonly batchSize?: number;
};

export type IRedisOutputStreamOptions = IRedisOptions & {
    readonly writeStream: string;
};

export enum RedisMetadata {
    OutputSinkStreamKey = "redis.stream.key",
}

export const AutoGenerateRedisStreamID = "*";

export type IRedisMessage = IMessage & {
    readonly streamId: string;
};

export interface IRedisClient {
    putObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        body: T,
        key: string
    ): Promise<void>;
    getObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        key: string
    ): Promise<T | undefined>;
    xAddObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        streamName: string,
        key: string,
        body: T,
        id?: string
    ): Promise<string>;
    xReadGroup(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerName: string,
        count: number,
        block: number,
        id?: string
    ): Promise<IRedisMessage[]>;
    xGroup(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerGroupStartId: string,
        supressAlreadyExistsError?: boolean
    ): Promise<string>;
    xAck(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        streamId: string
    ): Promise<number>;
    xPending(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        count: number
    ): Promise<IPelResult[]>;
    xClaim(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerName: string,
        minIdleTime: number,
        streamIds: string[]
    ): Promise<IRedisMessage[]>;
}

export function redisClient(configuration: IRedisOptions): IRedisClient {
    configuration = config.parse(RedisOptions, configuration, { base64Encode: true });
    return new RedisClient(configuration);
}

export function redisStreamSink(
    configuration: IRedisOutputStreamOptions
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(RedisOptions, configuration, { base64Encode: true });
    return new RedisStreamSink(configuration);
}

export function redisStreamSource(configuration: IRedisInputStreamOptions): IInputSource {
    configuration = config.parse(RedisOptions, configuration, {
        base64Encode: true,
        consumerId: generate(),
        consumerGroupStartId: "$",
        batchSize: 10,
        blockTimeout: 100,
        idleTimeout: 30000,
    });
    return new RedisStreamSource(configuration);
}
