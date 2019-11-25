/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span, Tags, Tracer } from "opentracing";
import { BufferedDispatchContext, TraceContext } from "..";
import {
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
import { failSpan, IRetrier, iterate, prettyEventName } from "../../utils";
import { IMessageProcessor, IMessageProcessorConfiguration } from "./IMessageProcessor";
import { annotator, validate } from "./utils";

export class SerialMessageProcessor implements IMessageProcessor {
    private readonly logger: ILogger;
    private readonly metrics: IMetrics;
    private readonly dispatcher: IMessageDispatcher;
    private readonly validator: IMessageValidator;
    private readonly stateProvider: IStateProvider<any> & IStateCacheLifecycle<any>;
    private readonly messageTypeMapper: IMessageTypeMapper;
    private readonly tracer: Tracer;

    constructor(config: IMessageProcessorConfiguration) {
        this.logger = config.logger;
        this.metrics = config.metrics;
        this.tracer = config.tracer;
        this.dispatcher = config.dispatcher;
        this.validator = config.validator;
        this.stateProvider = config.stateProvider;
        this.messageTypeMapper = config.messageTypeMapper;
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
        let context: BufferedDispatchContext | undefined;

        for await (const msg of source.start()) {
            let baseMetricTags: IMetricTags = {};
            const eventType = prettyEventName(msg.payload.type);
            let handlingInputSpan: Span | undefined;
            let haveUnfinishedSpan: boolean;
            let dispatchError;
            let sinkError;
            try {
                if (!this.dispatcher.canDispatch(msg.payload)) {
                    this.metrics.increment(MessageProcessingMetrics.Processed, {
                        event_type: eventType,
                        result: MessageProcessingResults.Unhandled,
                    });
                    continue;
                }

                baseMetricTags = annotator(msg.payload, inputMessageMetricAnnotator);
                this.metrics.increment(MessageProcessingMetrics.Received, {
                    ...baseMetricTags,
                    event_type: eventType,
                });

                const result = this.validator.validate(msg.payload);
                if (result.success) {
                    let success: boolean;
                    do {
                        success = true;
                        handlingInputSpan = this.tracer.startSpan(
                            OpenTracingOperations.HandlingInputMsg,
                            { childOf: msg.spanContext }
                        );
                        handlingInputSpan.setTag(
                            OpenTracingTagKeys.ProcessingStrategy,
                            SerialMessageProcessor.name
                        );
                        handlingInputSpan.setTag(OpenTracingTagKeys.EventType, eventType);
                        handlingInputSpan.setTag(Tags.COMPONENT, "cookie-cutter-core");
                        haveUnfinishedSpan = true;

                        context = new BufferedDispatchContext(
                            msg,
                            this.metrics,
                            this.logger,
                            this.stateProvider,
                            new TraceContext(this.tracer, handlingInputSpan),
                            outputMessageEnricher,
                            this.messageTypeMapper,
                            serviceDiscovery
                        );

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
                        handlingInputSpan.finish();
                        handlingInputSpan = undefined;
                        haveUnfinishedSpan = false;

                        if (validate(context, this.validator, this.logger)) {
                            let handlingOutputSpan: Span | undefined;
                            sinkError = undefined;
                            let result = MessageProcessingResults.Success;
                            try {
                                handlingOutputSpan = this.tracer.startSpan(
                                    OpenTracingOperations.SendingToSink,
                                    { childOf: msg.spanContext }
                                );
                                handlingOutputSpan.setTag(
                                    OpenTracingTagKeys.ProcessingStrategy,
                                    SerialMessageProcessor.name
                                );
                                handlingOutputSpan.setTag(OpenTracingTagKeys.EventType, eventType);
                                handlingOutputSpan.setTag(Tags.COMPONENT, "cookie-cutter-core");
                                await sinkRetrier.retry(async (bail) => {
                                    try {
                                        await sink.sink(iterate([context]), bail);
                                        sinkError = undefined;
                                    } catch (e) {
                                        this.logger.error("failed to process output in sink", e, {
                                            type: msg.payload.type,
                                        });
                                        sinkError = e;
                                        if (e instanceof SequenceConflictError) {
                                            bail(e);
                                        }
                                        throw e;
                                    }
                                });
                            } catch (e) {
                                if (!(e instanceof SequenceConflictError)) {
                                    throw e;
                                }
                            } finally {
                                if (sinkError) {
                                    if (handlingOutputSpan) {
                                        failSpan(handlingOutputSpan, sinkError);
                                    }
                                    context.handlerResult.error = sinkError;
                                    if (sinkError instanceof SequenceConflictError) {
                                        success = false;
                                        this.logger.warn("sequence number conflict, retrying", {
                                            key: sinkError.details.key,
                                            newSn: sinkError.details.newSn,
                                            expectedSn: sinkError.details.expectedSn,
                                            actualSn: sinkError.details.actualSn,
                                        });
                                        for (const stateRef of context.loadedStates) {
                                            this.stateProvider.invalidate(stateRef.key);
                                        }
                                        result = MessageProcessingResults.ErrSeqNum;
                                    } else {
                                        result = MessageProcessingResults.Error;
                                    }
                                } else {
                                    context.complete();
                                }
                                this.metrics.increment(MessageProcessingMetrics.Processed, {
                                    ...baseMetricTags,
                                    result,
                                    event_type: eventType,
                                });
                                if (handlingOutputSpan) {
                                    handlingOutputSpan.finish();
                                }
                            }
                        } else {
                            this.metrics.increment(MessageProcessingMetrics.Processed, {
                                ...baseMetricTags,
                                result: MessageProcessingResults.ErrInvalidMsg,
                                event_type: eventType,
                            });
                        }
                    } while (!success);
                } else {
                    this.logger.error("received invalid message", result.message, {
                        type: msg.payload.type,
                    });
                    this.metrics.increment(MessageProcessingMetrics.Processed, {
                        ...baseMetricTags,
                        result: MessageProcessingResults.ErrInvalidMsg,
                        event_type: eventType,
                    });
                }
            } catch (e) {
                throw e;
            } finally {
                if (dispatchError || sinkError) {
                    this.metrics.increment(MessageProcessingMetrics.Processed, {
                        ...baseMetricTags,
                        result: MessageProcessingResults.ErrFailedMsgProcessing,
                        event_type: eventType,
                    });
                }
                if (dispatchError && handlingInputSpan) {
                    failSpan(handlingInputSpan, dispatchError);
                }
                if (handlingInputSpan && haveUnfinishedSpan) {
                    handlingInputSpan.finish();
                }

                try {
                    if (context !== undefined) {
                        await msg.release(context.handlerResult.value, context.handlerResult.error);
                    } else {
                        await msg.release();
                    }
                } catch (e) {
                    this.logger.error("failed to release input", e, { type: msg.payload.type });
                    this.metrics.increment(MessageProcessingMetrics.Processed, {
                        ...baseMetricTags,
                        result: MessageProcessingResults.ErrFailedMsgRelease,
                        event_type: eventType,
                    });
                }
            }
        }
    }
}
