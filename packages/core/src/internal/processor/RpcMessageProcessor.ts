/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from "..";
import {
    IConcurrencyConfiguration,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IServiceRegistry,
    MessageProcessingMetrics,
    MessageProcessingResults,
} from "../../model";
import { Future, IRetrier, prettyEventName } from "../../utils";
import { ConcurrentMessageProcessor } from "./ConcurrentMessageProcessor";
import { IMessageProcessorConfiguration } from "./IMessageProcessor";

export class RpcMessageProcessor extends ConcurrentMessageProcessor {
    constructor(
        config: IConcurrencyConfiguration,
        processorConfig: IMessageProcessorConfiguration
    ) {
        super(config, processorConfig);
        this.processingStrategy = RpcMessageProcessor.name;
    }

    protected async processingLoop(
        enricher: IMessageEnricher,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier
    ): Promise<void> {
        const timer = setInterval(() => {
            this.metrics.gauge(MessageProcessingMetrics.ConcurrentHandlers, this.inFlight);
        }, this.config.queueMetricsIntervalMs);
        timer.unref();

        let msgComplete = new Future<void>();
        const pending = new Set<Promise<void>>();
        let error;
        for await (const msg of this.inputQueue.iterate()) {
            if (error) {
                break;
            }
            if (this.inFlight >= this.config.maximumParallelRpcRequests) {
                await msgComplete.promise;
                msgComplete = new Future<void>();
            }

            this.inFlight++;
            const p = this.handleInput(
                msg,
                enricher,
                msgMetricsAnnotator,
                serviceDiscovery,
                dispatchRetrier
            );
            pending.add(p);
            p.then(() => {
                this.inFlight--;
                pending.delete(p);
                msgComplete.resolve();
            }).catch((e) => {
                this.inFlight--;
                pending.delete(p);
                msgComplete.resolve();
                error = e;
            });
        }
        await Promise.all(pending.values());
        this.outputQueue.close();
        if (error) {
            throw error;
        }
    }

    protected async releaseSourceMessages(
        batch: Array<BufferedDispatchContext<any>>
    ): Promise<void> {
        const pending: Array<Promise<void>> = [];
        for (const item of batch) {
            pending.push(
                new Promise(async (resolve) => {
                    try {
                        await item.source.release(
                            item.handlerResult.value,
                            item.handlerResult.error
                        );
                    } catch (e) {
                        this.logger.error("failed to release input", e, {
                            type: item.source.payload.type,
                        });
                        this.metrics.increment(MessageProcessingMetrics.Processed, {
                            result: MessageProcessingResults.ErrFailedMsgRelease,
                            event_type: prettyEventName(item.source.payload.type),
                        });
                    } finally {
                        resolve();
                    }
                })
            );
        }

        await Promise.all(pending);
    }
}
