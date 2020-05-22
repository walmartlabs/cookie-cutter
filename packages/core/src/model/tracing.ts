/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span, SpanContext, Tracer } from "opentracing";
import { IApplicationBuilder } from "./dsl";

export enum OpenTracingOperations {
    HandlingInputMsg = "Handling Input Message",
    SendingToSink = "Sending to Output Messages Sink",
}

export enum OpenTracingTagKeys {
    // Non-standard Tags
    FunctionName = "function.name",
    EventType = "event.type",
    BatchId = "batch.id",
    ProcessingStrategy = "processing.strategy",
    ErrorObject = "error.object",
    RpcCall = "rpc.call",
    RpcHost = "rpc.host",
    RpcFlavor = "rpc.flavor",
    RpcParams = "rpc.params",
    RpcPort = "rpc.port",
    RpcError = "rpc.error",
    KafkaAccess = "kafka.access",
    KafkaService = "kafka.service",
    KafkaTopic = "kafka.topic",
    KafkaBroker = "kafka.broker",
}

export interface ISpanTags {
    readonly [key: string]: any;
}

export interface ITracing {
    addTags(items: ISpanTags): void;
    child(name: string, parent?: SpanContext | Span): Span;
    readonly context: SpanContext;
}

export interface ITracerBuilder {
    create(): Tracer;
}

export interface ITracingBuilder {
    set(tracer: Tracer): ITracingBuilder;
    annotate(globalTags: ISpanTags): ITracingBuilder;
    done(): IApplicationBuilder;
}
