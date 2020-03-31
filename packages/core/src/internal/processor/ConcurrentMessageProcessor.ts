/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span } from "opentracing";
import { IMessageProcessor, IMessageProcessorConfiguration } from ".";
import { BufferedDispatchContext } from "..";
import {
    BoundedPriorityQueue,
    EventProcessingMetadata,
    failSpan,
    IConcurrencyConfiguration,
    IInputSource,
    IInputSourceContext,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IMetricTags,
    IOutputSink,
    IRetrier,
    IServiceRegistry,
    MessageProcessingMetrics,
    MessageProcessingResults,
    MessageRef,
    prettyEventName,
    SequenceConflictError,
    sleep,
    waitForPendingIO,
} from "../..";
import { BaseMessageProcessor, IInflightSignal } from "./BaseMessageProcessor";
import { Batch } from "./Batch";
import { ReprocessingContext } from "./ReprocessingContext";
import { annotator, validate } from "./utils";

export interface IQueueItem<T> {
    item: T;
    signal: IInflightSignal;
}

const HIGH_PRIORITY = 1;

export class ConcurrentMessageProcessor extends BaseMessageProcessor implements IMessageProcessor {
    protected readonly inputQueue: BoundedPriorityQueue<MessageRef>;
    protected readonly outputQueue: BoundedPriorityQueue<IQueueItem<BufferedDispatchContext>>;

    public constructor(
        protected readonly config: IConcurrencyConfiguration,
        processorConfig: IMessageProcessorConfiguration
    ) {
        super(processorConfig);
        this.inputQueue = new BoundedPriorityQueue(config.inputQueueCapacity);
        this.outputQueue = new BoundedPriorityQueue(config.outputQueueCapacity);
    }

    protected get name(): string {
        return ConcurrentMessageProcessor.name;
    }

    protected reportStatistics() {
        this.metrics.gauge(
            MessageProcessingMetrics.InputQueue,
            this.inputQueue.length + super.currentlyInflight.length
        );
        this.metrics.gauge(MessageProcessingMetrics.OutputQueue, this.outputQueue.length);
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
                timer = setInterval(
                    () => this.reportStatistics(),
                    this.config.queueMetricsIntervalMs
                );
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
        const inputContext: IInputSourceContext = {
            evict: async (predicate: (MessageRef) => boolean): Promise<void> => {
                this.inputQueue.update(predicate, (msg) => msg.evict());
                await Promise.all(super.currentlyInflight.map((i) => i.promise));
            },
        };

        for await (const msg of source.start(inputContext)) {
            if (!(await this.inputQueue.enqueue(msg))) {
                await msg.release(undefined, new Error("unavailable"));
            }
        }

        await Promise.all(super.currentlyInflight.map((s) => s.promise));
        this.inputQueue.close();
    }

    protected async processingLoop(
        enricher: IMessageEnricher,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier
    ): Promise<void> {
        for await (const msg of this.inputQueue.iterate()) {
            const signal = super.createInflightSignal();
            try {
                await this.handleInput(
                    msg,
                    signal,
                    enricher,
                    msgMetricsAnnotator,
                    serviceDiscovery,
                    dispatchRetrier
                );
            } catch (e) {
                signal.resolve();
                this.inputQueue.close();
                throw e;
            }
        }

        // in case the prev loop caught an Error we need to iterate
        // over the remaining messages in the queue and release them
        for await (const msg of this.inputQueue.iterate()) {
            await msg.release(undefined, new Error("unavailable"));
        }

        this.outputQueue.close();
    }

    protected async handleReprocessingContext(msg: MessageRef): Promise<void> {
        // if we are reprocessing this message then undo all state changes first
        const reproContext = msg.metadata<ReprocessingContext>(
            EventProcessingMetadata.ReprocessingContext
        );
        if (reproContext) {
            this.stateProvider.invalidate(reproContext.evictions());
        }
    }

    protected async handleInput(
        msg: MessageRef,
        signal: IInflightSignal,
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
            if (msg.isEvicted) {
                return;
            }

            await this.handleReprocessingContext(msg);

            handlingInputSpan = super.createDispatchSpan(msg.spanContext, eventType);
            const context = super.createDispatchContext(
                msg,
                handlingInputSpan,
                enricher,
                serviceDiscovery
            );

            if (!this.dispatcher.canDispatch(msg.payload)) {
                super.incrementProcessedMsg({}, eventType, MessageProcessingResults.Unhandled);
            } else {
                baseMetricTags = annotator(msg.payload, msgMetricsAnnotator);
                super.incrementReceived(baseMetricTags, eventType);

                const result = this.validator.validate(msg.payload);
                if (result.success) {
                    await super.dispatchToHandler(msg, context, dispatchRetrier);
                    dispatchError = context.handlerResult.error;

                    if (validate(context, this.validator, this.logger)) {
                        context.complete();
                    } else {
                        context.clear();
                        super.incrementProcessedMsg(
                            baseMetricTags,
                            eventType,
                            MessageProcessingResults.ErrInvalidMsg
                        );
                    }
                } else {
                    if (!(await this.dispatcher.invalid(msg.payload, context))) {
                        this.logger.error("received invalid message", result.message, {
                            type: msg.payload.type,
                        });
                    }
                    failSpan(handlingInputSpan, "message failed validation");
                    super.incrementProcessedMsg(
                        baseMetricTags,
                        eventType,
                        MessageProcessingResults.ErrInvalidMsg
                    );
                }
            }

            if (await this.outputQueue.enqueue({ item: context, signal })) {
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
                super.incrementProcessedMsg(
                    baseMetricTags,
                    eventType,
                    MessageProcessingResults.ErrFailedMsgProcessing
                );
            }
            if (!handled) {
                try {
                    await msg.release(undefined, new Error("unavailable"));
                } finally {
                    signal.resolve();
                }
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
        const batch = new Batch<IQueueItem<BufferedDispatchContext>>(
            this.config.minimumBatchSize,
            this.config.maximumBatchSize
        );
        let continueTriggered = false;

        for await (const queueItem of this.outputQueue.iterate()) {
            const context = queueItem.item;
            const baseMetricTags: IMetricTags = context.completed
                ? annotator(context.source.payload, msgMetricsAnnotator)
                : {};
            const eventType = prettyEventName(context.source.payload.type);
            let handlingOutputSpan: Span | undefined;
            let sinkError;
            try {
                if (context.completed) {
                    handlingOutputSpan = super.createSinkSpan(
                        context.source.spanContext,
                        eventType
                    );
                }
                if (reproContext !== undefined) {
                    const sequence = context.source.metadata<number>(
                        EventProcessingMetadata.Sequence
                    );
                    if (this.shouldSkip(sequence, reproContext.atSn)) {
                        this.logger.debug(
                            `skipping output message with sequence ${sequence} while waiting for retry`
                        );
                        try {
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
                        } finally {
                            queueItem.signal.resolve();
                        }
                        super.incrementProcessedMsg(
                            baseMetricTags,
                            eventType,
                            MessageProcessingResults.ErrReprocessing
                        );
                        continueTriggered = true;
                        continue;
                    } else {
                        reproContext = undefined;
                    }
                }

                batch.add(queueItem);
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

                sinkError = await super.dispatchToSink(
                    batch.items.map((i) => i.item),
                    sink,
                    sinkRetrier
                );

                for (const item of batch.items) {
                    if (item.item.completed) {
                        this.metrics.increment(MessageProcessingMetrics.Processed, {
                            ...annotator(item.item.source.payload, msgMetricsAnnotator),
                            result: MessageProcessingResults.Success,
                            event_type: prettyEventName(item.item.source.payload.type),
                        });
                    }
                }
            } catch (e) {
                sinkError = e;
                if (!(e instanceof SequenceConflictError)) {
                    throw e;
                }
            } finally {
                if (continueTriggered) {
                    continueTriggered = false;
                    for (const { signal } of batch.items) {
                        signal.resolve();
                    }
                } else {
                    if (sinkError) {
                        if (handlingOutputSpan) {
                            failSpan(handlingOutputSpan, sinkError);
                        }
                        if (!(sinkError instanceof SequenceConflictError)) {
                            for (const item of batch.items) {
                                item.item.handlerResult.error = sinkError;
                            }
                            await this.releaseSourceMessages(batch.items.map((i) => i.item));
                        } else {
                            const sequence = sinkError.context.source.metadata<number>(
                                EventProcessingMetadata.Sequence
                            );
                            reproContext = new ReprocessingContext(sequence);
                            await this.releaseSourceMessages(
                                batch.items
                                    .slice(
                                        0,
                                        batch.items.map((i) => i.item).indexOf(sinkError.context)
                                    )
                                    .map((i) => i.item)
                            );
                            for (
                                let i = batch.items.map((i) => i.item).indexOf(sinkError.context);
                                i < batch.items.length;
                                i++
                            ) {
                                const { item } = batch.items[i];
                                if (
                                    !(await this.inputQueue.enqueue(
                                        reproContext.wrap(item),
                                        HIGH_PRIORITY
                                    ))
                                ) {
                                    await context.source.release(
                                        undefined,
                                        new Error("unable to reprocess")
                                    );
                                }
                            }

                            let errorTags: any = {
                                key: sinkError.details.key,
                                newSn: sinkError.details.newSn,
                                expectedSn: sinkError.details.expectedSn,
                                actualSn: sinkError.details.actualSn,
                            };
                            if (
                                sinkError.details.actualEpoch !== undefined ||
                                sinkError.details.expectedEpoch !== undefined
                            ) {
                                errorTags = {
                                    ...errorTags,
                                    expectedEpoch: sinkError.details.expectedEpoch,
                                    actualEpoch: sinkError.details.actualEpoch,
                                };
                            }
                            this.logger.warn("sequence number conflict, retrying", errorTags);

                            super.incrementProcessedMsg(
                                baseMetricTags,
                                eventType,
                                MessageProcessingResults.ErrSeqNum
                            );
                        }
                    } else {
                        await this.releaseSourceMessages(batch.items.map((i) => i.item));
                    }

                    for (const { signal } of batch.items) {
                        signal.resolve();
                    }
                    batch.reset();
                }
                if (handlingOutputSpan) {
                    handlingOutputSpan.finish();
                }
            }
        }
    }

    protected async releaseSourceMessages(batch: BufferedDispatchContext<any>[]): Promise<void> {
        for (const item of batch) {
            try {
                await item.source.release(item.handlerResult.value, item.handlerResult.error);
            } catch (e) {
                this.logger.error("failed to release input", e, { type: item.source.payload.type });
                super.incrementProcessedMsg(
                    {},
                    prettyEventName(item.source.payload.type),
                    MessageProcessingResults.ErrFailedMsgRelease
                );
            }
        }
    }

    protected shouldSkip(sequence: number, reproAtSn: number): boolean {
        return sequence !== reproAtSn;
    }
}
