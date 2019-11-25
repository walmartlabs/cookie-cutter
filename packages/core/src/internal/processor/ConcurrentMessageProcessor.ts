/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span, Tags, Tracer } from "opentracing";
import { BufferedDispatchContext, TraceContext } from "..";
import {
    IConcurrencyConfiguration,
    IInputSource,
    ILogger,
    IMessageDispatcher,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IMessageTypeMapper,
    IMessageValidator,
    IMetrics,
    IMetricTags,
    IOutputSink,
    IServiceRegistry,
    IStateCacheLifecycle,
    IStateProvider,
    MessageProcessingMetrics,
    MessageProcessingResults,
    OpenTracingOperations,
    OpenTracingTagKeys,
    SequenceConflictError,
} from "../../model";
import { EventProcessingMetadata, MessageRef } from "../../model";
import {
    BoundedPriorityQueue,
    failSpan,
    IRetrier,
    iterate,
    prettyEventName,
    sleep,
    waitForPendingIO,
} from "../../utils";
import { Batch } from "./Batch";
import { IMessageProcessor, IMessageProcessorConfiguration } from "./IMessageProcessor";
import { ReprocessingContext } from "./ReprocessingContext";
import { annotator, validate } from "./utils";

const HIGH_PRIORITY = 1;

export class ConcurrentMessageProcessor implements IMessageProcessor {
    protected readonly logger: ILogger;
    protected readonly metrics: IMetrics;
    protected readonly dispatcher: IMessageDispatcher;
    protected readonly validator: IMessageValidator;
    protected readonly stateProvider: IStateProvider<any> & IStateCacheLifecycle<any>;
    protected readonly messageTypeMapper: IMessageTypeMapper;
    protected readonly inputQueue: BoundedPriorityQueue<MessageRef>;
    protected readonly outputQueue: BoundedPriorityQueue<BufferedDispatchContext>;
    protected tracer: Tracer;
    protected inFlight: number;
    protected processingStrategy = ConcurrentMessageProcessor.name;

    constructor(
        protected readonly config: IConcurrencyConfiguration,
        processorConfig: IMessageProcessorConfiguration
    ) {
        this.logger = processorConfig.logger;
        this.metrics = processorConfig.metrics;
        this.dispatcher = processorConfig.dispatcher;
        this.validator = processorConfig.validator;
        this.stateProvider = processorConfig.stateProvider;
        this.messageTypeMapper = processorConfig.messageTypeMapper;
        this.tracer = processorConfig.tracer;
        this.inputQueue = new BoundedPriorityQueue(config.inputQueueCapacity);
        this.outputQueue = new BoundedPriorityQueue(config.outputQueueCapacity);
        this.inFlight = 0;
    }

    public async run(
        source: IInputSource,
        inputMessageMetricAnnotator: IMessageMetricAnnotator,
        sink: IOutputSink<BufferedDispatchContext>,
        outputMessageEnricher: IMessageEnricher,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier,
        sinkRetrier: IRetrier
    ): Promise<void> {
        let timer: NodeJS.Timer | undefined;
        try {
            if (this.config.emitMetricsForQueues) {
                timer = setInterval(() => {
                    this.metrics.gauge(
                        MessageProcessingMetrics.InputQueue,
                        this.inputQueue.length + this.inFlight
                    );
                    this.metrics.gauge(
                        MessageProcessingMetrics.OutputQueue,
                        this.outputQueue.length
                    );
                }, this.config.queueMetricsIntervalMs);
                timer.unref();
            }

            await Promise.all([
                this.inputLoop(source),
                this.processingLoop(
                    outputMessageEnricher,
                    inputMessageMetricAnnotator,
                    serviceDiscovery,
                    dispatchRetrier
                ),
                this.outputLoop(sink, inputMessageMetricAnnotator, sinkRetrier),
            ]);
        } catch (e) {
            this.inputQueue.close();
            this.outputQueue.close();
            throw e;
        } finally {
            if (timer) {
                clearInterval(timer);
            }
        }
    }

    private async inputLoop(source: IInputSource): Promise<void> {
        for await (const item of source.start()) {
            if (!(await this.inputQueue.enqueue(item))) {
                await item.release(undefined, new Error("unavailable"));
            }
        }
        this.inputQueue.close();
    }

    protected async processingLoop(
        enricher: IMessageEnricher,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier
    ): Promise<void> {
        for await (const msg of this.inputQueue.iterate()) {
            try {
                this.inFlight++;
                await this.handleInput(
                    msg,
                    enricher,
                    msgMetricsAnnotator,
                    serviceDiscovery,
                    dispatchRetrier
                );
            } catch (e) {
                this.inputQueue.close();
                throw e;
            } finally {
                this.inFlight--;
            }
        }

        // in case the prev loop caught an Error we need to iterate
        // over the remaining messages in the queue and release them
        for await (const msg of this.inputQueue.iterate()) {
            await msg.release(undefined, new Error("unavailable"));
        }

        this.outputQueue.close();
    }

    protected async handleInput(
        msg: MessageRef,
        enricher: IMessageEnricher,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier
    ): Promise<void> {
        const eventType = prettyEventName(msg.payload.type);
        let baseMetricTags: IMetricTags = {};
        let handlingInputSpan: Span | undefined;
        let handled: boolean = false;
        let dispatchError;
        try {
            // if we are reprocessing this message then undo all state changes first
            const reproContext = msg.metadata<ReprocessingContext>(
                EventProcessingMetadata.ReprocessingContext
            );
            if (reproContext) {
                this.stateProvider.invalidate(reproContext.evictions());
            }

            handlingInputSpan = this.tracer.startSpan(OpenTracingOperations.HandlingInputMsg, {
                childOf: msg.spanContext,
            });
            handlingInputSpan.setTag(
                OpenTracingTagKeys.ProcessingStrategy,
                this.processingStrategy
            );
            handlingInputSpan.setTag(OpenTracingTagKeys.EventType, eventType);
            handlingInputSpan.setTag(Tags.COMPONENT, "cookie-cutter-core");

            const context = new BufferedDispatchContext(
                msg,
                this.metrics,
                this.logger,
                this.stateProvider,
                new TraceContext(this.tracer, handlingInputSpan),
                enricher,
                this.messageTypeMapper,
                serviceDiscovery
            );

            if (!this.dispatcher.canDispatch(msg.payload)) {
                this.metrics.increment(MessageProcessingMetrics.Processed, {
                    event_type: eventType,
                    result: MessageProcessingResults.Unhandled,
                });
            } else {
                baseMetricTags = annotator(msg.payload, msgMetricsAnnotator);
                this.metrics.increment(MessageProcessingMetrics.Received, {
                    ...baseMetricTags,
                    event_type: eventType,
                });

                const result = this.validator.validate(msg.payload);
                if (result.success) {
                    context.handlerResult.value = await dispatchRetrier.retry(async (bail) => {
                        context.bail = bail;
                        try {
                            const val = await this.dispatcher.dispatch(msg.payload, context);
                            context.handlerResult.error = undefined;
                            dispatchError = undefined;
                            return val;
                        } catch (e) {
                            this.logger.error("failed to dispatch message", e, {
                                type: msg.payload.type,
                            });
                            context.handlerResult.error = e;
                            context.clear();
                            dispatchError = e;
                            throw e;
                        }
                    });

                    if (validate(context, this.validator, this.logger)) {
                        context.complete();
                    } else {
                        context.clear();
                        this.metrics.increment(MessageProcessingMetrics.Processed, {
                            ...baseMetricTags,
                            result: MessageProcessingResults.ErrInvalidMsg,
                            event_type: eventType,
                        });
                    }
                } else {
                    this.logger.error("received invalid message", result.message, {
                        type: msg.payload.type,
                    });
                    failSpan(handlingInputSpan, "message failed validation");
                    this.metrics.increment(MessageProcessingMetrics.Processed, {
                        ...baseMetricTags,
                        result: MessageProcessingResults.ErrInvalidMsg,
                        event_type: eventType,
                    });
                }
            }

            if (await this.outputQueue.enqueue(context)) {
                handled = true;
            }

            // yield some CPU cycles to I/O that might have
            // completed in the mean time to avoid timeouts
            // firing falsely.
            const sequence = context.source.metadata<number>(EventProcessingMetadata.Sequence);
            if (sequence % this.config.yieldForIOMessageCount === 0) {
                await waitForPendingIO();
            }
        } catch (e) {
            throw new Error("failed to process message");
        } finally {
            if (dispatchError) {
                if (handlingInputSpan) {
                    failSpan(handlingInputSpan, dispatchError);
                }
                this.metrics.increment(MessageProcessingMetrics.Processed, {
                    ...baseMetricTags,
                    result: MessageProcessingResults.ErrFailedMsgProcessing,
                    event_type: eventType,
                });
            }
            if (!handled) {
                await msg.release(undefined, new Error("unavailable"));
            }

            if (handlingInputSpan) {
                handlingInputSpan.finish();
            }
        }
    }

    private async outputLoop(
        sink: IOutputSink<BufferedDispatchContext>,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        sinkRetrier: IRetrier
    ): Promise<void> {
        let reproContext: ReprocessingContext | undefined;
        const batch = new Batch<BufferedDispatchContext>(
            this.config.minimumBatchSize,
            this.config.maximumBatchSize
        );
        let continueTriggered = false;

        for await (const context of this.outputQueue.iterate()) {
            const baseMetricTags: IMetricTags = context.completed
                ? annotator(context.source.payload, msgMetricsAnnotator)
                : {};
            const eventType = prettyEventName(context.source.payload.type);
            let handlingOutputSpan: Span | undefined;
            let sinkError;
            try {
                if (context.completed) {
                    handlingOutputSpan = this.tracer.startSpan(
                        OpenTracingOperations.SendingToSink,
                        { childOf: context.source.spanContext }
                    );
                    handlingOutputSpan.setTag(
                        OpenTracingTagKeys.ProcessingStrategy,
                        ConcurrentMessageProcessor.name
                    );
                    handlingOutputSpan.setTag(OpenTracingTagKeys.EventType, eventType);
                    handlingOutputSpan.setTag(Tags.COMPONENT, "cookie-cutter-core");
                }
                if (reproContext !== undefined) {
                    const sequence = context.source.metadata<number>(
                        EventProcessingMetadata.Sequence
                    );
                    if (sequence !== reproContext.atSn) {
                        this.logger.debug(
                            `skipping output message with sequence ${sequence} while waiting for retry`
                        );
                        if (
                            !(await this.inputQueue.enqueue(
                                reproContext.wrap(context),
                                HIGH_PRIORITY
                            ))
                        ) {
                            await context.source.release(
                                undefined,
                                new Error("unable to reprocess")
                            );
                            return;
                        }
                        this.metrics.increment(MessageProcessingMetrics.Processed, {
                            ...baseMetricTags,
                            result: MessageProcessingResults.ErrReprocessing,
                            event_type: eventType,
                        });
                        continueTriggered = true;
                        continue;
                    } else {
                        reproContext = undefined;
                    }
                }

                batch.add(context);
                if (this.outputQueue.length === 0 && batch.shouldLinger()) {
                    await sleep(this.config.batchLingerIntervalMs);
                }

                if (!batch.isFull() && this.outputQueue.length > 0) {
                    continueTriggered = true;
                    continue;
                }

                if (this.config.emitMetricsForBatches) {
                    this.metrics.gauge(MessageProcessingMetrics.OutputBatch, batch.items.length);
                }

                await sinkRetrier.retry(async (bail) => {
                    try {
                        await sink.sink(iterate(batch.items), bail);
                        sinkError = undefined;
                    } catch (e) {
                        this.logger.error("failed to process output in sink", e, {
                            type: context.source.payload.type,
                        });
                        sinkError = e;
                        if (e instanceof SequenceConflictError) {
                            bail(e);
                        }
                        throw e;
                    }
                });

                for (const item of batch.items) {
                    if (item.completed) {
                        this.metrics.increment(MessageProcessingMetrics.Processed, {
                            ...annotator(item.source.payload, msgMetricsAnnotator),
                            result: MessageProcessingResults.Success,
                            event_type: prettyEventName(item.source.payload.type),
                        });
                    }
                }
            } catch (e) {
                if (!(e instanceof SequenceConflictError)) {
                    throw e;
                }
            } finally {
                if (continueTriggered) {
                    continueTriggered = false;
                } else {
                    if (sinkError) {
                        if (handlingOutputSpan) {
                            failSpan(handlingOutputSpan, sinkError);
                        }
                        if (!(sinkError instanceof SequenceConflictError)) {
                            for (const item of batch.items) {
                                item.handlerResult.error = sinkError;
                            }
                            await this.releaseSourceMessages(batch.items);
                        } else {
                            const sequence = sinkError.context.source.metadata<number>(
                                EventProcessingMetadata.Sequence
                            );
                            reproContext = new ReprocessingContext(sequence);
                            await this.releaseSourceMessages(
                                batch.items.slice(0, batch.items.indexOf(sinkError.context))
                            );
                            for (
                                let i = batch.items.indexOf(sinkError.context);
                                i < batch.items.length;
                                i++
                            ) {
                                const item = batch.items[i];
                                if (
                                    !(await this.inputQueue.enqueue(
                                        reproContext.wrap(item),
                                        HIGH_PRIORITY
                                    ))
                                ) {
                                    await item.source.release(
                                        undefined,
                                        new Error("unable to reprocess")
                                    );
                                }
                            }
                            this.logger.warn("sequence number conflict, retrying", {
                                key: sinkError.details.key,
                                newSn: sinkError.details.newSn,
                                expectedSn: sinkError.details.expectedSn,
                                actualSn: sinkError.details.actualSn,
                            });
                            this.metrics.increment(MessageProcessingMetrics.Processed, {
                                ...baseMetricTags,
                                result: MessageProcessingResults.ErrSeqNum,
                                event_type: eventType,
                            });
                        }
                    } else {
                        await this.releaseSourceMessages(batch.items);
                    }
                    batch.reset();
                }
                if (handlingOutputSpan) {
                    handlingOutputSpan.finish();
                }
            }
        }
    }

    protected async releaseSourceMessages(
        batch: Array<BufferedDispatchContext<any>>
    ): Promise<void> {
        for (const item of batch) {
            try {
                await item.source.release(item.handlerResult.value, item.handlerResult.error);
            } catch (e) {
                this.logger.error("failed to release input", e, { type: item.source.payload.type });
                this.metrics.increment(MessageProcessingMetrics.Processed, {
                    result: MessageProcessingResults.ErrFailedMsgRelease,
                    event_type: prettyEventName(item.source.payload.type),
                });
            }
        }
    }
}
