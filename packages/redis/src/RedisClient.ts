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
import {
    AbortError,
    ClientClosedError,
    ConnectionTimeoutError,
    createClient,
    DisconnectsClientError,
    ErrorReply,
    ReconnectStrategyError,
    RedisClientType,
    RootNodesUnavailableError,
    SocketClosedUnexpectedlyError,
    WatchError,
} from "redis";

import { isNullOrUndefined } from "util";
import { IRedisOptions, IRedisClient, IRedisMessage } from ".";

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

type RawPELResult = {
    id: string;
    owner: string;
    millisecondsSinceLastDelivery: number;
    deliveriesCounter: number;
};

export type RawReadGroupResult = {
    name: string | Buffer;
    messages: { id: string | Buffer; message: { [x: string]: string | Buffer } }[];
}[];

type RawXClaimResult = {
    id: string;
    message: {
        [x: string]: string;
    };
};

function parseRawPELResult(results: RawPELResult[]): IPELResult[] {
    return results.map(({ id, owner, millisecondsSinceLastDelivery, deliveriesCounter }) => {
        return {
            messageId: id,
            consumerId: owner,
            idleTime: millisecondsSinceLastDelivery,
            timesDelivered: deliveriesCounter,
        };
    });
}

export function parseRawReadGroupResult(
    results: RawReadGroupResult,
    payloadKey: string,
    typeNameKey: string
): { streamName: string; messageId: string; data?: string; type?: string }[] {
    return results.reduce((acc, curr) => {
        const { name, messages } = curr;
        const streamName = typeof name === "string" ? name : name.toString();
        for (const msg of messages) {
            const { id, message } = msg;
            const messageId = typeof id === "string" ? id : id.toString();
            if (isNullOrUndefined(message) || Object.keys(message).length < 1) {
                acc.push({ streamName, messageId });
                continue;
            }

            let data = message[payloadKey];
            if (data) {
                data = typeof data === "string" ? data : data.toString();
            }
            let type = message[typeNameKey];
            if (type) {
                type = typeof type === "string" ? type : type.toString();
            }
            acc.push({ streamName, messageId, data, type });
        }
        return acc;
    }, []);
}

function extractXClaimValues(
    results: RawXClaimResult[],
    payloadKey: string,
    typeNameKey: string
): { messageId: string; data: string; type: string }[] {
    return results.reduce((acc, curr) => {
        const { id, message } = curr;
        acc.push({
            messageId: id,
            data: message[payloadKey],
            type: message[typeNameKey],
        });
        return acc;
    }, []);
}

function getErrorName(error: any): string {
    if (
        error instanceof AbortError ||
        error instanceof WatchError ||
        error instanceof ConnectionTimeoutError ||
        error instanceof ClientClosedError ||
        error instanceof DisconnectsClientError ||
        error instanceof SocketClosedUnexpectedlyError ||
        error instanceof RootNodesUnavailableError ||
        error instanceof ReconnectStrategyError ||
        error instanceof ErrorReply
    ) {
        return error.name;
    }
    return "NonRedisError";
}

export class RedisClient implements IRedisClient, IRequireInitialization, IDisposable {
    private readonly client: RedisClientType;
    private disposeInitiated: boolean = false;
    private readonly encoder: IMessageEncoder;
    private readonly typeMapper: IMessageTypeMapper;

    private logger: ILogger = DefaultComponentContext.logger;
    private tracer: Tracer = DefaultComponentContext.tracer;
    private metrics: IMetrics = DefaultComponentContext.metrics;

    constructor(private readonly config: IRedisOptions) {
        this.encoder = config.encoder;
        this.typeMapper = config.typeMapper;
        this.client = createClient({
            socket: {
                host: this.config.host,
                port: this.config.port,
            },
            database: this.config.db,
            password: this.config.password,
        });
        this.client.on("connected", () => {
            this.logger.debug("Connection to Redis established");
        });
        this.client.on("error", (err) => {
            this.logger.error("Redis Error", err);
            throw err;
        });
        this.client.on("ready", () => {
            this.logger.debug("Redis connection is ready");
        });
        this.client.on("reconnecting", () => {
            this.logger.debug("Reconnecting to Redis");
        });
        this.client.on("end", () => {
            this.logger.debug("Disconnected from Redis");
            if (!this.disposeInitiated) {
                throw new Error("connection to Redis lost");
            }
        });
    }

    public async dispose(): Promise<void> {
        this.disposeInitiated = true;
        await this.client.quit();
        this.client.unref();
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        this.logger = context.logger;
        await this.client.connect();
    }

    private getTypeName<T>(type: string | IClassType<T>): string {
        let typeName: string;
        if (typeof type !== "string") {
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
                errorType: getErrorName(e),
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
                errorType: getErrorName(e),
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

            let opts = {};
            if (!isNullOrUndefined(maxStreamLength)) {
                opts = {
                    TRIM: {
                        strategy: "MAXLEN",
                        strategyModifier: "~",
                        threshold: maxStreamLength.toString(),
                    },
                };
            }

            const payload = {
                [keys.payload]: storableValue,
                [keys.typeName]: typeName,
            };
            const insertedId = await this.client.xAdd(streamName, id, payload, opts);
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
                errorType: getErrorName(e),
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
            const opts = {
                MKSTREAM: true,
            };
            const response = await this.client.xGroupCreate(
                streamName as any,
                consumerGroup as any,
                consumerGroupStartId as any,
                opts as any
            );
            this.metrics.increment(RedisClientMetrics.XGroup, {
                db,
                streamName,
                consumerGroup,
                result: RedisMetricResults.Success,
            });
            if (typeof response === "string") {
                return response;
            } else {
                return response.toString();
            }
        } catch (err) {
            const alreadyExistsErrorMessage = "BUSYGROUP Consumer Group name already exists";
            if (suppressAlreadyExistsError && (err as any).message === alreadyExistsErrorMessage) {
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
                errorType: getErrorName(err),
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
            const response = await this.client.xAck(streamName, consumerGroup, id);
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
                errorType: getErrorName(err),
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
        block: number,
        payloadKey: string,
        typeNameKey: string
    ): Promise<IRedisMessage[]> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xReadGroupObject Call", {
            childOf: context,
        });
        const streamNames = streams.map((s) => s.name);
        const ids = streams.map((s) => s.id || ">");
        const redisStreams = streams.map((s) => {
            return { key: s.name, id: s.id || ">" };
        });

        this.spanLogAndSetTags(span, this.xReadGroup.name, this.config.db, ids, streamNames);

        try {
            const opts = {
                COUNT: String(count),
                BLOCK: String(block),
                // NOACK: true,
            };
            const response = await this.client.xReadGroup(
                consumerGroup as any,
                consumerName as any,
                redisStreams as any,
                opts as any
            );

            // if the client returns null, early exit w/ an empty array
            if (!response || response.length < 1) return [];

            const results = parseRawReadGroupResult(response, payloadKey, typeNameKey);
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
                errorType: getErrorName(error),
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
        count: number
    ): Promise<IPELResult[]> {
        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xPending Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xPending.name, this.config.db, undefined, streamName);
        try {
            const results = await this.client.xPendingRange(
                streamName as any,
                consumerGroup as any,
                "-" as any,
                "+" as any,
                String(count) as any
            );
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
                errorType: getErrorName(err),
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
        payloadKey: string,
        typeNameKey: string,
        ids: string[]
    ): Promise<IRedisMessage[]> {
        if (ids.length < 1) return [];

        const db = this.config.db;
        const span = this.tracer.startSpan("Redis Client xClaim Call", { childOf: context });
        this.spanLogAndSetTags(span, this.xClaim.name, this.config.db, null, streamName);

        try {
            const response = await this.client.xClaim(
                streamName as any,
                consumerGroup as any,
                consumerName as any,
                String(minIdleTime) as any,
                ids as any
            );

            if (!response || response.length < 1) return [];

            const results = extractXClaimValues(response, payloadKey, typeNameKey);
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
                errorType: getErrorName(error),
            });
            throw error;
        } finally {
            span.finish();
        }
    }
}
