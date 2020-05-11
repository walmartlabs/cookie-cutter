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
import { IRedisOptions, IRedisClient, RedisStreamID } from ".";
import { RedisProxy } from "./RedisProxy";

export enum RedisMetrics {
    Get = "cookie_cutter.redis_client.get",
    Set = "cookie_cutter.redis_client.set",
    XAdd = "cookie_cutter.redis_client.xadd",
}

export enum RedisMetricResults {
    Success = "success",
    Error = "error",
}

export enum RedisOpenTracingTagKeys {
    BucketName = "redis.bucket",
}

export class RedisClient implements IRedisClient, IRequireInitialization, IDisposable {
    private client: RedisProxy;
    private encoder: IMessageEncoder;
    private typeMapper: IMessageTypeMapper;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "Redis Client Call";

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
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, db, key);
        const typeName = this.getTypeName(type);
        const msg: IMessage = {
            type: typeName,
            payload: body,
        };
        const encodedBody = this.encoder.encode(msg);
        try {
            await this.client.set(key, encodedBody);
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
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.getObject.name, this.config.db, key);
        try {
            const typeName = this.getTypeName(type);
            const response = await this.client.get(key);
            let data;
            if (response) {
                const msg = this.encoder.decode(response, typeName);
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
        id: string = RedisStreamID.AutoGenerate
    ): Promise<string> {
        const db = this.config.db;
        const span = this.tracer!.startSpan(this.spanOperationName, { childOf: context });

        this.spanLogAndSetTags(span, this.xAddObject.name, db, key, streamName);

        const typeName = this.getTypeName(type);

        const encodedBody = this.encoder.encode({
            type: typeName,
            payload: body,
        });

        const storableValue = Buffer.from(encodedBody).toString("base64");
        try {
            const insertedId = await this.client.xadd(streamName, id, key, storableValue);
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
}
