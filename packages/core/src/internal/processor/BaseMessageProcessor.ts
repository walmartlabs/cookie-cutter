/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IMessageProcessorConfiguration } from ".";
import { DefaultComponentContext } from "../../defaults";
import {
    IComponentContext,
    ILogger,
    IMessageDispatcher,
    IMessageEnricher,
    IMessageTypeMapper,
    IMessageValidator,
    IMetrics,
    IMetricTags,
    IOutputSink,
    IRequireInitialization,
    IServiceRegistry,
    IStateCacheLifecycle,
    IStateProvider,
    MessageProcessingMetrics,
    MessageProcessingResults,
    MessageRef,
    OpenTracingOperations,
    OpenTracingTagKeys,
    SequenceConflictError,
    IValidateResult,
    NoInvalidHandlerError,
} from "../../model";
import { Future, IRetrier, iterate } from "../../utils";
import { BufferedDispatchContext } from "../BufferedDispatchContext";
import { TraceContext } from "../TraceContext";

export interface IInflightSignal {
    readonly promise: Promise<void>;
    resolve();
}

export abstract class BaseMessageProcessor implements IRequireInitialization {
    private _logger: ILogger;
    private _metrics: IMetrics;
    private _tracer: Tracer;
    private _currentlyInflight = new Set<IInflightSignal>();

    protected readonly dispatcher: IMessageDispatcher;
    protected readonly validator: IMessageValidator;
    protected readonly stateProvider: IStateProvider<any> & IStateCacheLifecycle<any>;
    protected readonly messageTypeMapper: IMessageTypeMapper;

    protected constructor(config: IMessageProcessorConfiguration) {
        this._logger = DefaultComponentContext.logger;
        this._metrics = DefaultComponentContext.metrics;
        this._tracer = DefaultComponentContext.tracer;
        this.dispatcher = config.dispatcher;
        this.validator = config.validator;
        this.stateProvider = config.stateProvider;
        this.messageTypeMapper = config.messageTypeMapper;
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this._logger = ctx.logger;
        this._metrics = ctx.metrics;
        this._tracer = ctx.tracer;
    }

    protected abstract get name(): string;

    protected createInflightSignal(): IInflightSignal {
        const future = new Future<void>();
        this._currentlyInflight.add(future);
        // tslint:disable-next-line:no-floating-promises
        future.promise.then(() => {
            this._currentlyInflight.delete(future);
        });
        return future;
    }

    protected get currentlyInflight(): IInflightSignal[] {
        return Array.from(this._currentlyInflight.values());
    }

    protected get logger(): ILogger {
        return this._logger;
    }

    protected get metrics(): IMetrics {
        return this._metrics;
    }

    protected get tracer(): Tracer {
        return this._tracer;
    }

    protected createDispatchContext(
        source: MessageRef,
        span: Span,
        enricher: IMessageEnricher,
        serviceRegistry: IServiceRegistry
    ): BufferedDispatchContext {
        return new BufferedDispatchContext(
            source,
            this.metrics,
            this.logger,
            this.stateProvider,
            new TraceContext(this.tracer, span),
            enricher,
            this.messageTypeMapper,
            serviceRegistry
        );
    }

    protected createDispatchSpan(parent: SpanContext, eventType: string): Span {
        const span = this.tracer.startSpan(OpenTracingOperations.HandlingInputMsg, {
            childOf: parent,
        });
        span.setTag(OpenTracingTagKeys.ProcessingStrategy, this.name);
        span.setTag(OpenTracingTagKeys.EventType, eventType);
        span.setTag(Tags.COMPONENT, "cookie-cutter-core");
        return span;
    }

    protected createSinkSpan(parent: SpanContext, eventType: string): Span {
        const span = this.tracer.startSpan(OpenTracingOperations.SendingToSink, {
            childOf: parent,
        });
        span.setTag(OpenTracingTagKeys.ProcessingStrategy, this.name);
        span.setTag(OpenTracingTagKeys.EventType, eventType);
        span.setTag(Tags.COMPONENT, "cookie-cutter-core");
        return span;
    }

    protected incrementReceived(baseMetrics: IMetricTags, eventType: string): void {
        this.metrics.increment(MessageProcessingMetrics.Received, {
            ...baseMetrics,
            event_type: eventType,
        });
    }

    protected incrementProcessedMsg(
        baseMetrics: IMetricTags,
        eventType: string,
        result: MessageProcessingResults
    ): void {
        this.metrics.increment(MessageProcessingMetrics.Processed, {
            ...baseMetrics,
            result,
            event_type: eventType,
        });
    }

    protected async dispatchToHandler(
        msg: MessageRef,
        context: BufferedDispatchContext,
        retrier: IRetrier,
        metadata: { validation: IValidateResult }
    ): Promise<void> {
        context.handlerResult.value = await retrier.retry(async (retry) => {
            context.retry = retry;
            try {
                const val = await this.dispatcher.dispatch(msg.payload, context, metadata);
                context.handlerResult.error = undefined;
                return val;
            } catch (e) {
                context.handlerResult.error = e;
                if (e instanceof NoInvalidHandlerError) {
                    retry.bail(e);
                }
                this.logger.error("failed to dispatch message", e, {
                    type: msg.payload.type,
                    currentAttempt: retry.currentAttempt,
                    maxAttempts: retry.maxAttempts,
                    finalAttempt: retry.isFinalAttempt(),
                });
                context.clear();
                throw e;
            }
        });
    }

    protected async dispatchToSink(
        items: BufferedDispatchContext[],
        sink: IOutputSink<BufferedDispatchContext>,
        retrier: IRetrier
    ): Promise<any> {
        let sinkError;
        await retrier.retry(async (retry) => {
            try {
                await sink.sink(iterate(items), retry);
                sinkError = undefined;
            } catch (e) {
                const logMsg = "failed to process output in sink";
                const tags = {
                    type: items[items.length - 1].source.payload.type,
                    currentAttempt: retry.currentAttempt,
                    maxAttempts: retry.maxAttempts,
                    finalAttempt: true,
                };
                sinkError = e;
                if (e instanceof SequenceConflictError) {
                    retry.bail(e);
                } else {
                    tags.finalAttempt = retry.isFinalAttempt();
                    this.logger.error(logMsg, e, { ...tags });
                    throw e;
                }
            }
        });

        return sinkError;
    }
}
