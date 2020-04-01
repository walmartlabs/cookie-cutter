/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IConcurrencyConfiguration,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IServiceRegistry,
    MessageProcessingMetrics,
} from "../../model";
import { IRetrier } from "../../utils";
import { ConcurrentMessageProcessor } from "./ConcurrentMessageProcessor";
import { IMessageProcessorConfiguration } from "./IMessageProcessor";

export class RpcMessageProcessor extends ConcurrentMessageProcessor {
    constructor(
        config: IConcurrencyConfiguration,
        processorConfig: IMessageProcessorConfiguration
    ) {
        super(config, processorConfig);
    }

    protected get name(): string {
        return RpcMessageProcessor.name;
    }

    protected reportStatistics() {
        super.reportStatistics();
        this.metrics.gauge(
            MessageProcessingMetrics.ConcurrentHandlers,
            super.currentlyInflight.length
        );
    }

    protected async processingLoop(
        enricher: IMessageEnricher,
        msgMetricsAnnotator: IMessageMetricAnnotator,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier
    ): Promise<void> {
        let error;
        for await (const msg of this.inputQueue.iterate()) {
            if (error) {
                break;
            }

            const signal = super.createInflightSignal();
            const p = super.handleInput(
                msg,
                signal,
                enricher,
                msgMetricsAnnotator,
                serviceDiscovery,
                dispatchRetrier
            );

            p.catch((e) => {
                error = e;
                signal.resolve();
            });

            if (super.currentlyInflight.length >= this.config.maximumParallelRpcRequests) {
                await Promise.race(super.currentlyInflight.map((s) => s.promise));
            }
        }

        this.outputQueue.close();
        if (error) {
            throw error;
        }
    }

    protected shouldSkip(): boolean {
        return false;
    }
}
