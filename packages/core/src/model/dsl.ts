/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IInputSource,
    ILogger,
    IMessageDeduper,
    IMessageDispatcher,
    IMessageEnricher,
    IMessageValidator,
    IMetrics,
    IOutputSink,
    IPublishedMessage,
    IStateProvider,
    LogLevel,
} from ".";
import { CancelablePromise } from "../utils";
import { IMessageTypeMapper, IStateVerification, IStoredMessage } from "./message";
import { IMessageMetricAnnotator } from "./metrics";
import { ITracerBuilder, ITracingBuilder } from "./tracing";

export interface IApplicationBuilder {
    run(errorHandling: ErrorHandlingMode, parallelism?: ParallelismMode): CancelablePromise<void>;
    run(behavior?: IApplicationRuntimeBehavior): CancelablePromise<void>;
    input(): IInputBuilder;
    typeMapper(mapper: IMessageTypeMapper): IApplicationBuilder;
    validate(validator: IMessageValidator): IApplicationBuilder;
    state<TState, T extends IStateProvider<TState>>(provider: T): IApplicationBuilder;
    metrics(metrics: IMetrics): IApplicationBuilder;
    /**
     * @deprecated Will be deprecated starting version 2.0. Please use `tracing` instead.
     *
     * @param {ITracerBuilder} trace
     * @returns {IApplicationBuilder}
     * @memberof IApplicationBuilder
     */
    tracer(trace: ITracerBuilder): IApplicationBuilder;
    tracing(): ITracingBuilder;
    logger(logger: ILogger, level?: LogLevel): IApplicationBuilder;
    dispatch<T>(target: T): IApplicationBuilder;
    dispatch(dispatcher: IMessageDispatcher): IApplicationBuilder;
    services(): IServiceRegistryBuilder;
    output(): IOutputBuilder;
    if(predicate: boolean, action: (app: IApplicationBuilder) => void): IApplicationBuilder;
}

export interface IInputBuilder {
    done(): IApplicationBuilder;
    add(items: IInputSource): IInputBuilder;
    enrich(enricher: IMessageEnricher): IInputBuilder;
    annotate(annotator: IMessageMetricAnnotator): IInputBuilder;
    dedupe(deduper: IMessageDeduper): IInputBuilder;
}

export interface IOutputBuilder {
    done(): IApplicationBuilder;
    published(sink: IOutputSink<IPublishedMessage>): IOutputBuilder;
    stored(sink: IOutputSink<IStoredMessage | IStateVerification>): IOutputBuilder;
    enrich(enricher: IMessageEnricher): IOutputBuilder;
    annotate(annotator: IMessageMetricAnnotator): IOutputBuilder;
}

export interface IServiceRegistryBuilder {
    done(): IApplicationBuilder;
    add<T>(serviceName: string, service: T): IServiceRegistryBuilder;
}

export interface IComponentBuilder<T> {
    build(): T;
}

export enum ErrorHandlingMode {
    LogAndContinue = 1,
    LogAndRetry,
    LogAndFail,
    LogAndRetryOrContinue,
    LogAndRetryOrFail,
}

export enum RetryMode {
    Linear = 1,
    Exponential,
}

export enum ParallelismMode {
    Serial = 1,
    Concurrent,
    Rpc,
}

export interface IParallelismConfiguration {
    readonly mode: ParallelismMode;
    readonly concurrencyConfiguration?: IConcurrencyConfiguration;
}

export interface IConcurrencyConfiguration {
    readonly emitMetricsForBatches?: boolean;
    readonly emitMetricsForQueues?: boolean;
    readonly queueMetricsIntervalMs?: number;
    readonly inputQueueCapacity?: number;
    readonly outputQueueCapacity?: number;
    readonly yieldForIOMessageCount?: number;
    readonly batchLingerIntervalMs?: number;
    readonly minimumBatchSize?: number;
    readonly maximumBatchSize?: number;
    readonly maximumParallelRpcRequests?: number;
}

export interface IApplicationRuntimeBehavior {
    readonly dispatch: IComponentRuntimeBehavior;
    readonly sink: IComponentRuntimeBehavior;
    readonly parallelism?: IParallelismConfiguration;
}

export interface IComponentRuntimeBehavior {
    readonly mode: ErrorHandlingMode;
    readonly retryMode?: RetryMode;
    readonly retryIntervalMs?: number;
    readonly maxRetryIntervalMs?: number;
    readonly exponentBase?: number;
    readonly randomize?: boolean;
    readonly retries?: number;
}
