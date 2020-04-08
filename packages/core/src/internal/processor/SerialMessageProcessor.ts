/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span } from "opentracing";
import { BufferedDispatchContext } from "..";
import {
    failSpan,
    IInputSource,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IOutputSink,
    IRetrier,
    IServiceRegistry,
    prettyEventName,
} from "../..";
import {
    IInputSourceContext,
    IMetricTags,
    MessageProcessingResults,
    MessageRef,
    SequenceConflictError,
    NoInvalidHandlerError,
} from "../../model";
import { BaseMessageProcessor } from "./BaseMessageProcessor";
import { IMessageProcessor, IMessageProcessorConfiguration } from "./IMessageProcessor";
import { annotator, validate } from "./utils";

export class SerialMessageProcessor extends BaseMessageProcessor implements IMessageProcessor {
    public constructor(config: IMessageProcessorConfiguration) {
        super(config);
    }

    protected get name(): string {
        return SerialMessageProcessor.name;
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
        const sourceContext: IInputSourceContext = {
            evict: async (): Promise<void> => {
                await Promise.all(super.currentlyInflight.map((i) => i.promise));
            },
        };

        for await (const msg of source.start(sourceContext)) {
            if (msg.isEvicted) {
                continue;
            }

            const signal = super.createInflightSignal();
            try {
                await this.handleMessage(
                    msg,
                    inputMessageMetricAnnotator,
                    sink,
                    outputMessageEnricher,
                    serviceDiscovery,
                    dispatchRetrier,
                    sinkRetrier
                );
            } finally {
                signal.resolve();
            }
        }
    }

    private async handleMessage(
        msg: MessageRef,
        inputMessageMetricAnnotator: IMessageMetricAnnotator,
        sink: IOutputSink<BufferedDispatchContext>,
        outputMessageEnricher: IMessageEnricher,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier,
        sinkRetrier: IRetrier
    ): Promise<void> {
        let context: BufferedDispatchContext | undefined;
        const eventType = prettyEventName(msg.payload.type);
        let handlingInputSpan: Span | undefined;
        let haveUnfinishedSpan: boolean;
        let baseMetricTags: IMetricTags = {};
        let dispatchError;
        let sinkError;
        try {
            if (!this.dispatcher.canDispatch(msg.payload)) {
                super.incrementProcessedMsg({}, eventType, MessageProcessingResults.Unhandled);
                return;
            }

            baseMetricTags = annotator(msg.payload, inputMessageMetricAnnotator);
            super.incrementReceived(baseMetricTags, eventType);

            let success: boolean;
            do {
                success = true;
                haveUnfinishedSpan = true;

                handlingInputSpan = super.createDispatchSpan(msg.spanContext, eventType);
                context = super.createDispatchContext(
                    msg,
                    handlingInputSpan,
                    outputMessageEnricher,
                    serviceDiscovery
                );

                const result = this.validator.validate(msg.payload);
                try {
                    await super.dispatchToHandler(msg, context, dispatchRetrier, {
                        validation: result,
                    });
                    dispatchError = context.handlerResult.error;
                    if (dispatchError) {
                        return;
                    }
                } catch (e) {
                    dispatchError = e;
                    throw e;
                }

                handlingInputSpan.finish();
                handlingInputSpan = undefined;
                haveUnfinishedSpan = false;

                if (validate(context, this.validator, this.logger)) {
                    let handlingOutputSpan: Span | undefined;
                    sinkError = undefined;
                    let result = MessageProcessingResults.Success;
                    try {
                        handlingOutputSpan = super.createSinkSpan(msg.spanContext, eventType);
                        sinkError = await super.dispatchToSink([context], sink, sinkRetrier);
                    } catch (e) {
                        sinkError = e;
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
                        super.incrementProcessedMsg(baseMetricTags, eventType, result);
                        if (handlingOutputSpan) {
                            handlingOutputSpan.finish();
                        }
                    }
                } else {
                    super.incrementProcessedMsg(
                        baseMetricTags,
                        eventType,
                        MessageProcessingResults.ErrInvalidMsg
                    );
                }
            } while (!success);
        } catch (e) {
            if (!(e instanceof NoInvalidHandlerError)) {
                throw e;
            }
        } finally {
            if (dispatchError || sinkError) {
                if (dispatchError instanceof NoInvalidHandlerError) {
                    context.handlerResult.error = undefined;
                    super.incrementProcessedMsg(
                        baseMetricTags,
                        eventType,
                        MessageProcessingResults.ErrInvalidMsg
                    );
                } else {
                    super.incrementProcessedMsg(
                        baseMetricTags,
                        eventType,
                        MessageProcessingResults.ErrFailedMsgProcessing
                    );
                }
            }
            if (dispatchError && handlingInputSpan) {
                if (dispatchError instanceof NoInvalidHandlerError) {
                    failSpan(handlingInputSpan, "message failed validation");
                } else {
                    failSpan(handlingInputSpan, dispatchError);
                }
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
                super.incrementProcessedMsg(
                    baseMetricTags,
                    eventType,
                    MessageProcessingResults.ErrFailedMsgRelease
                );
            }
        }
    }
}
