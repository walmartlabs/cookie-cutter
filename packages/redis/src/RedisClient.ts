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
    IMessage,
    IMessageEncoder,
    IMessageTypeMapper,
    IMetrics,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { isString } from "util";
import { IRedisOptions, IRedisClient, AutoGenerateRedisStreamID, IRedisMessage } from ".";
import { RedisProxy, RawReadGroupResult, RawPELResult, RawXClaimResult } from "./RedisProxy";

enum RedisMetrics {
    Get = "cookie_cutter.redis_client.get",
    Set = "cookie_cutter.redis_client.set",
    XAdd = "cookie_cutter.redis_client.xadd",
    XRead = "cookie_cutter.redis_client.xread",
    XReadGroup = "cookie_cutter.redis_client.xreadgroup",
    XGroupCreate = "cookie_cutter.redis_client.xgroup.create",
    XGroupAlreadyExists = "cookie_cutter.redis_client.xgroup.already_exists",
    XAck = "cookie_cutter.redis_client.xack",
    XPending = "cookie_cutter.redis_client.xpending",
    XClaim = "cookie_cutter.redis_client.xclaim",
}

enum RedisMetricResults {
    Success = "success",
    Error = "error",
}

export enum RedisOpenTracingTagKeys {
    BucketName = "redis.bucket",
}

export interface IPelResult {
    streamId: string;
    consumerId: string;
    idleTime: number;
    timesDelivered: number;
}

function formatXPendingResults(results: RawPELResult): IPelResult[] {
    return results.map(([streamId, consumerId, idleTime, timesDelivered]) => ({
        streamId,
        consumerId,
        idleTime,
        timesDelivered,
    }));
}

function extractXReadGroupValues(
    results: RawReadGroupResult
): { streamId: string; data: string; type: string }[] {
    return results.reduce((acc, curr) => {
        // streamName, streamValue
        const [, [streamValue = []]] = curr;

        // [streamId, keyValues]
        const [streamId, keyValues = []] = streamValue;

        if (keyValues.length < 1) {
            return acc;
        }

        // [RedisMetadata.OutputSinkStreamKey, serializedProto, type, typeName]
        const [, data, , type] = keyValues;

        acc.push({ streamId, data, type });
        return acc;
    }, []);
}

function extractXClaimValues(
    results: RawXClaimResult
): { streamId: string; data: string; type: string }[] {
    return results.reduce((acc, curr) => {
        const [streamId, keyValues = []] = curr;

        const [, data, , type] = keyValues;
        acc.push({ streamId, data, type });
        return acc;
    }, []);
}
export class RedisClient implements IRedisClient, IRequireInitialization, IDisposable {
    private client: RedisProxy;
    private encoder: IMessageEncoder;
    private typeMapper: IMessageTypeMapper;
    private tracer: Tracer;
    private metrics: IMetrics;

    constructor(private readonly config: IRedisOptions) {
        this.encoder = config.encoder;
        this.typeMapper = config.typeMapper;
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        this.client = new RedisProxy(this.config.host, this.config.port, this.config.db);
    }

    public async dispose(): Promise<void> {
        await this.client.dispose();
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
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
        key: string,
        streamName?: string
    ): void {
        span.log({ bucket, key, streamName });
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
            this.metrics.increment(RedisMetrics.Set, {
                type,
                db,
                result: RedisMetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisMetrics.Set, {
                type,
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

            this.metrics.increment(RedisMetrics.Get, {
                type,
                db,
                result: RedisMetricResults.Success,
            });
            return data;
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(RedisMetrics.Get, {
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
        key: string,
        body: T,
        id: string = AutoGenerateRedisStreamID
    ): Promise<string> {
        const db = this.config.db;
        const span = this.tracer!.startSpan("Redis Client xAddObject Call", { childOf: context });

        this.spanLogAndSetTags(span, this.xAddObject.name, db, key, streamName);

        const typeName = this.getTypeName(type);

        const encodedBody = this.encoder.encode({
            type: typeName,
            payload: body,
        });

        const buf = Buffer.from(encodedBody);
        const storableValue = this.config.base64Encode ? buf.toString("base64") : buf;
        try {
            const insertedId = await this.client.xadd(
                streamName,
                id,
                key,
                storableValue,
                "type",
                typeName
            );
            this.metrics!.increment(RedisMetrics.XAdd, {
                type,
                db,
                streamName,
                result: RedisMetricResults.Success,
            });

            return insertedId;
        } catch (e) {
            failSpan(span, e);
            this.metrics!.increment(RedisMetrics.XAdd, {
                type,
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
        supressAlreadyExistsError: boolean = true
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
            this.metrics.increment(RedisMetrics.XGroupCreate, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return response;
        } catch (err) {
            const alreadyExistsErrorMessage = "BUSYGROUP Consumer Group name already exists";
            if (supressAlreadyExistsError && err.message === alreadyExistsErrorMessage) {
                // TODO should this be considered an error or success?
                this.metrics.increment(RedisMetrics.XGroupAlreadyExists, {
                    db,
                    streamName,
                    consumerGroup,
                    result: RedisMetricResults.Success,
                });

                return "OK";
            }

            failSpan(span, err);
            this.metrics.increment(RedisMetrics.XGroupCreate, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                error: err,
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
        streamId: string
    ): Promise<number> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xAck Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xAck.name, this.config.db, undefined, streamName);
        try {
            const response = await this.client.xack(streamName, consumerGroup, streamId);
            this.metrics.increment(RedisMetrics.XAck, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return response;
        } catch (err) {
            failSpan(span, err);
            this.metrics.increment(RedisMetrics.XAck, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                error: err,
            });

            throw err;
        } finally {
            span.finish();
        }
    }

    public async xReadGroup(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        consumerName: string,
        count: number,
        block: number,
        id: string = ">"
    ): Promise<IRedisMessage[]> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xReadGroupObject Call", {
            childOf: context,
        });

        this.spanLogAndSetTags(span, this.xReadGroup.name, this.config.db, id, streamName);

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
                streamName,
                id,
            ]);

            // if the client returns null, early exit w/ an empty array
            if (!response) return [];

            const results = extractXReadGroupValues(response);

            const messages: IRedisMessage[] = results.map(({ streamId, data, type }) => {
                const buf = this.config.base64Encode
                    ? Buffer.from(data, "base64")
                    : Buffer.from(data);

                return { streamId, ...this.encoder.decode(new Uint8Array(buf), type) };
            });

            this.metrics.increment(RedisMetrics.XReadGroup, {
                db,
                streamName,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Success,
            });

            return messages;
        } catch (error) {
            failSpan(span, error);

            this.metrics.increment(RedisMetrics.XReadGroup, {
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

    public async xPending(
        context: SpanContext,
        streamName: string,
        consumerGroup: string,
        count
    ): Promise<IPelResult[]> {
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
            this.metrics.increment(RedisMetrics.XPending, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            return formatXPendingResults(results);
        } catch (err) {
            failSpan(span, err);
            this.metrics.increment(RedisMetrics.XPending, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Error,
                error: err,
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
        streamIds: string[]
    ): Promise<IRedisMessage[]> {
        // if there are no pending messages return early w/ an empty array
        if (streamIds.length < 1) return [];

        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xClaim Call", { childOf: context });

        // Not sure what we should pass for the key here
        this.spanLogAndSetTags(span, this.xClaim.name, this.config.db, null, streamName);

        try {
            const response = await this.client.xclaim([
                streamName,
                consumerGroup,
                consumerName,
                String(minIdleTime),
                ...streamIds,
            ]);

            // if the client returns null, early exit w/ an empty array
            if (!response) return [];

            const results = extractXClaimValues(response);

            const messages: IRedisMessage[] = results.map(({ streamId, data, type }) => {
                const buf = this.config.base64Encode
                    ? Buffer.from(data, "base64")
                    : Buffer.from(data);

                return { streamId, ...this.encoder.decode(new Uint8Array(buf), type) };
            });

            this.metrics.increment(RedisMetrics.XClaim, {
                db,
                streamName,
                consumerGroup,
                consumerName,
                result: RedisMetricResults.Success,
            });

            return messages;
        } catch (error) {
            failSpan(span, error);
            this.metrics.increment(RedisMetrics.XClaim, {
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
