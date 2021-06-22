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
    IDisposable,
    ILogger,
    IMessage,
    IMessageEncoder,
    IMessageTypeMapper,
    IMetrics,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { RedisError } from "redis";
import { isString, isNullOrUndefined } from "util";
import { IRedisOptions, IRedisClient, IRedisMessage } from ".";
import { RedisProxy, RawReadGroupResult, RawPELResult, RawXClaimResult } from "./RedisProxy";

export enum RedisClientMetrics {
    Get = "cookie_cutter.redis_client.get",
    Set = "cookie_cutter.redis_client.set",
    XAdd = "cookie_cutter.redis_client.xadd",
    XRead = "cookie_cutter.redis_client.xread",
    XReadGroup = "cookie_cutter.redis_client.xreadgroup",
    XGroup = "cookie_cutter.redis_client.xgroup",
    XAck = "cookie_cutter.redis_client.xack",
    XPending = "cookie_cutter.redis_client.xpending",
    XClaim = "cookie_cutter.redis_client.xclaim",
}

enum MetricLabels {
    Type = "type",
}

enum RedisMetricResults {
    Success = "success",
    Error = "error",
    AlreadyExists = "already_exists",
}

export enum RedisOpenTracingTagKeys {
    BucketName = "redis.bucket",
}

export interface IPELResult {
    messageId: string;
    consumerId: string;
    idleTime: number;
    timesDelivered: number;
}

function parseRawPELResult(results: RawPELResult): IPELResult[] {
    return results.map(([messageId, consumerId, idleTime, timesDelivered]) => ({
        messageId,
        consumerId,
        idleTime,
        timesDelivered,
    }));
}

export function parseRawReadGroupResult(
    results: RawReadGroupResult
): { streamName: string; messageId: string; data?: string; type?: string }[] {
    return results.reduce((acc, curr) => {
        const [streamName, streamValues = []] = curr;
        for (const streamValue of streamValues) {
            const [messageId, keyValues = []] = streamValue;

            if (isNullOrUndefined(keyValues) || keyValues?.length < 1) {
                acc.push({ streamName, messageId });
                continue;
            }

            // [RedisMetadata.OutputSinkStreamKey, serializedProto, type, typeName]
            const [, data, , type] = keyValues;
            acc.push({ streamName, messageId, data, type });
        }
        return acc;
    }, []);
}

function extractXClaimValues(
    results: RawXClaimResult
): { messageId: string; data: string; type: string }[] {
    return results.reduce((acc, curr) => {
        const [messageId, keyValues = []] = curr;

        const [, data, , type] = keyValues;
        acc.push({ messageId, data, type });
        return acc;
    }, []);
}

export class RedisClient implements IRedisClient, IRequireInitialization, IDisposable {
    private readonly client: RedisProxy;
    private readonly encoder: IMessageEncoder;
    private readonly typeMapper: IMessageTypeMapper;

    private logger: ILogger = DefaultComponentContext.logger;
    private tracer: Tracer = DefaultComponentContext.tracer;
    private metrics: IMetrics = DefaultComponentContext.metrics;

    constructor(private readonly config: IRedisOptions) {
        this.encoder = config.encoder;
        this.typeMapper = config.typeMapper;
        this.client = new RedisProxy(
            this.config.host,
            this.config.port,
            this.config.db,
            this.config.password
        );
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        this.logger = context.logger;
        await this.client.initialize(context);
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

    private spanLogAndSetTags(
        span: Span,
        funcName: string,
        bucket: number,
        keys: string | string[],
        streamNames?: string | string[]
    ): void {
        span.log({ bucket, keys, streamNames });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-redis");
        span.setTag(Tags.DB_INSTANCE, bucket);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(RedisOpenTracingTagKeys.BucketName, bucket);
    }

    public async putObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        body: T,
        key: string
    ): Promise<void> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client putObject Call", { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, db, key);
        const typeName = this.getTypeName(type);
        const msg: IMessage = {
            type: typeName,
            payload: body,
        };
        const encodedBody = this.encoder.encode(msg);
        const buf = Buffer.from(encodedBody);
        const storableValue = this.config.base64Encode ? buf.toString("base64") : buf;
        try {
            await this.client.set(key, storableValue);
            this.metrics.increment(RedisClientMetrics.Set, {
                [MetricLabels.Type]: typeName,
                db,
                result: RedisMetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisClientMetrics.Set, {
                [MetricLabels.Type]: typeName,
                db,
                result: RedisMetricResults.Error,
                error: e,
            });
            throw e;
        } finally {
            span.finish();
        }
    }

    public async getObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        key: string
    ): Promise<T | undefined> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client getObject Call", { childOf: context });
        this.spanLogAndSetTags(span, this.getObject.name, this.config.db, key);
        try {
            const typeName = this.getTypeName(type);
            const response = await this.client.get(key);

            let data;

            if (response) {
                const buf = this.config.base64Encode
                    ? Buffer.from(response, "base64")
                    : Buffer.from(response);
                const msg = this.encoder.decode(new Uint8Array(buf), typeName);
                data = msg.payload;
            }

            this.metrics.increment(RedisClientMetrics.Get, {
                [MetricLabels.Type]: typeName,
                db,
                result: RedisMetricResults.Success,
            });
            return data;
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisClientMetrics.Get, {
                db,
                result: RedisMetricResults.Error,
                error: e,
            });
            throw e;
        } finally {
            span.finish();
        }
    }

    public async xAddObject<T>(
        context: SpanContext,
        type: string | IClassType<T>,
        streamName: string,
        keys: {
            payload: string;
            typeName: string;
        },
        body: T,
        id: string = "*",
        maxStreamLength?: number
    ): Promise<string> {
        const db = this.config.db;
        const span = this.tracer!.startSpan("Redis Client xAddObject Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xAddObject.name, db, keys.payload, streamName);
        const typeName = this.getTypeName(type);
        try {
            const encodedBody = this.encoder.encode({
                type: typeName,
                payload: body,
            });

            const buf = Buffer.from(encodedBody);
            const storableValue = this.config.base64Encode ? buf.toString("base64") : buf;

            const args: (string | Buffer)[] = [streamName];
            if (!isNullOrUndefined(maxStreamLength)) {
                args.push("MAXLEN", "~", maxStreamLength.toString());
            }

            args.push(id, keys.payload, storableValue, keys.typeName, typeName);

            const insertedId = await this.client.xadd.call(this.client, args);
            this.metrics!.increment(RedisClientMetrics.XAdd, {
                [MetricLabels.Type]: typeName,
                db,
                streamName,
                result: RedisMetricResults.Success,
            });

            return insertedId;
        } catch (e) {
            failSpan(span, e);
            this.metrics!.increment(RedisClientMetrics.XAdd, {
                [MetricLabels.Type]: typeName,
                db,
                streamName,
                result: RedisMetricResults.Error,
                error: e,
            });
            throw e;
        } finally {
            span.finish();
        }
    }

    public async xGroup(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerGroupStartId: string,
        suppressAlreadyExistsError: boolean = true
    ): Promise<string> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xGroup Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xGroup.name, this.config.db, undefined, streamName);
        try {
            const response = await this.client.xgroup([
                "create",
                streamName,
                consumerGroup,
                consumerGroupStartId,
                "mkstream",
            ]);
            this.metrics.increment(RedisClientMetrics.XGroup, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return response;
        } catch (err) {
            const alreadyExistsErrorMessage = "BUSYGROUP Consumer Group name already exists";
            if (suppressAlreadyExistsError && err.message === alreadyExistsErrorMessage) {
                this.metrics.increment(RedisClientMetrics.XGroup, {
                    db,
                    streamName,
                    consumerGroup,
                    result: RedisMetricResults.AlreadyExists,
                });

                return "OK";
            }

            failSpan(span, err);
            this.metrics.increment(RedisClientMetrics.XGroup, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                errorType: err instanceof RedisError ? err.name : "NonRedisError",
            });

            throw err;
        } finally {
            span.finish();
        }
    }

    public async xAck(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        id: string
    ): Promise<number> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xAck Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xAck.name, this.config.db, undefined, streamName);
        try {
            const response = await this.client.xack(streamName, consumerGroup, id);
            this.metrics.increment(RedisClientMetrics.XAck, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return response;
        } catch (err) {
            failSpan(span, err);
            this.metrics.increment(RedisClientMetrics.XAck, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                errorType: err instanceof RedisError ? err.name : "NonRedisError",
            });

            throw err;
        } finally {
            span.finish();
        }
    }

    public async xReadGroup(
        context: SpanContext,
        streams: { name: string; id?: string }[],
        consumerGroup: string,
        consumerName: string,
        count: number,
        block: number
    ): Promise<IRedisMessage[]> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xReadGroupObject Call", {
            childOf: context,
        });
        const streamNames = streams.map((s) => s.name);
        const ids = streams.map((s) => s.id || ">");

        this.spanLogAndSetTags(span, this.xReadGroup.name, this.config.db, ids, streamNames);

        try {
            const response = await this.client.xreadgroup([
                "group",
                consumerGroup,
                consumerName,
                "count",
                String(count),
                "block",
                String(block),
                "streams",
                ...streamNames,
                ...ids,
            ]);

            // if the client returns null, early exit w/ an empty array
            if (!response) return [];

            const results = parseRawReadGroupResult(response);
            const validMessages = results.filter((item) => !isNullOrUndefined(item.data));
            const invalidMessages = results.filter((item) => isNullOrUndefined(item.data));

            for (const { streamName, messageId } of invalidMessages) {
                this.logger.error("detected bad message in redis stream", {
                    streamName,
                    messageId,
                });

                try {
                    await this.xAck(span.context(), streamName, consumerGroup, messageId);
                } catch (e) {
                    this.logger.error("failed to ack bad message", { streamName, messageId });
                }
            }

            const messages: IRedisMessage[] = validMessages.map(
                ({ streamName, messageId, data, type }) => {
                    const buf = this.config.base64Encode
                        ? Buffer.from(data, "base64")
                        : Buffer.from(data);

                    return {
                        messageId,
                        streamName,
                        ...this.encoder.decode(new Uint8Array(buf), type),
                    };
                }
            );

            this.metrics.increment(RedisClientMetrics.XReadGroup, {
                db,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Success,
            });

            return messages;
        } catch (error) {
            failSpan(span, error);

            this.metrics.increment(RedisClientMetrics.XReadGroup, {
                db,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Error,
                error,
            });
            throw error;
        } finally {
            span.finish();
        }
    }

    public async xPending(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        count
    ): Promise<IPELResult[]> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xPending Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xPending.name, this.config.db, undefined, streamName);
        try {
            const results = await this.client.xpending([
                streamName,
                consumerGroup,
                "-",
                "+",
                String(count),
            ]);
            this.metrics.increment(RedisClientMetrics.XPending, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return parseRawPELResult(results);
        } catch (err) {
            failSpan(span, err);
            this.metrics.increment(RedisClientMetrics.XPending, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                errorType: err instanceof RedisError ? err.name : "NonRedisError",
            });

            throw err;
        } finally {
            span.finish();
        }
    }

    public async xClaim(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerName: string,
        minIdleTime: number,
        ids: string[]
    ): Promise<IRedisMessage[]> {
        if (ids.length < 1) return [];

        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xClaim Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xClaim.name, this.config.db, null, streamName);

        try {
            const response = await this.client.xclaim([
                streamName,
                consumerGroup,
                consumerName,
                String(minIdleTime),
                ...ids,
            ]);

            if (!response) return [];

            const results = extractXClaimValues(response);
            const messages: IRedisMessage[] = results.map(({ messageId, data, type }) => {
                const buf = this.config.base64Encode
                    ? Buffer.from(data, "base64")
                    : Buffer.from(data);

                return { messageId, streamName, ...this.encoder.decode(new Uint8Array(buf), type) };
            });

            this.metrics.increment(RedisClientMetrics.XClaim, {
                db,
                streamName,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Success,
            });

            return messages;
        } catch (error) {
            failSpan(span, error);
            this.metrics.increment(RedisClientMetrics.XClaim, {
                db,
                streamName,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Error,
                error,
            });
            throw error;
        } finally {
            span.finish();
        }
    }
}
