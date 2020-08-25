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
    ObjectNameMessageTypeMapper,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { generate } from "shortid";

import { RedisOptions } from "./config";
import { RedisClient, IPELResult } from "./RedisClient";
import { RedisStreamSink } from "./RedisStreamSink";
import { RedisStreamSource } from "./RedisStreamSource";

export interface IRedisOptions {
    readonly host: string;
    readonly port?: number;
    readonly db?: number;
    readonly password?: string;
    readonly encoder: IMessageEncoder;
    readonly typeMapper?: IMessageTypeMapper;
    readonly base64Encode?: boolean;
}

export type IRedisInputStreamOptions = IRedisOptions & {
    readonly streams: string[];
    readonly consumerGroup: string;
    readonly consumerId?: string;
    readonly consumerGroupStartId?: string;
    readonly blockTimeout?: number;
    readonly batchSize?: number;
    readonly idleTimeout?: number | null;
    readonly reclaimMessageInterval?: number | null;
};

export type IRedisOutputStreamOptions = IRedisOptions & {
    readonly stream: string;
    readonly maxStreamLength?: number;
    readonly payloadKey?: string;
    readonly typeNameKey?: string;
};

export type IRedisMessage = IMessage & {
    readonly messageId: string;
    readonly streamName: string;
};

export enum RedisStreamMetadata {
    MessageId = "redis.messageId",
    Stream = "redis.stream",
    ConsumerId = "redis.consumerId",
}

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
        keys: {
            payload: string;
            typeName: string;
        },
        body: T,
        id?: string,
        maxStreamLength?: number
    ): Promise<string>;
    xReadGroup(
        context: SpanContext,
        streams: { name: string; id?: string }[],
        consumerGroup: string,
        consumerName: string,
        count: number,
        block: number
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
        id: string
    ): Promise<number>;
    xPending(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        count: number
    ): Promise<IPELResult[]>;
    xClaim(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerName: string,
        minIdleTime: number,
        ids: string[]
    ): Promise<IRedisMessage[]>;
}

export function redisClient(configuration: IRedisOptions): IRedisClient {
    configuration = config.parse(RedisOptions, configuration, {
        port: 6379,
        db: 0,
        base64Encode: true,
        typeMapper: new ObjectNameMessageTypeMapper(),
    });
    return new RedisClient(configuration);
}

export function redisStreamSink(
    configuration: IRedisOutputStreamOptions
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(RedisOptions, configuration, {
        port: 6379,
        db: 0,
        base64Encode: true,
        payloadKey: "redis.stream.key",
        typeNameKey: "redis.stream.type",
        typeMapper: new ObjectNameMessageTypeMapper(),
    });
    return new RedisStreamSink(configuration);
}

export function redisStreamSource(configuration: IRedisInputStreamOptions): IInputSource {
    configuration = config.parse(RedisOptions, configuration, {
        port: 6379,
        db: 0,
        base64Encode: true,
        consumerId: generate(),
        consumerGroupStartId: "$",
        batchSize: 10,
        blockTimeout: 100,
        idleTimeout: 30000,
        reclaimMessageInterval: 60000,
        payloadKey: "redis.stream.key",
        typeNameKey: "redis.stream.type",
        typeMapper: new ObjectNameMessageTypeMapper(),
    });
    return new RedisStreamSource(configuration);
}
