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
    MessageRef,
} from "../../model";
import { IRetrier, sleep } from "../../utils";
import { ConcurrentMessageProcessor } from "./ConcurrentMessageProcessor";
import { IMessageProcessorConfiguration } from "./IMessageProcessor";
import { EpochStateProvider } from "../EpochStateProvider";

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

    protected async handleReprocessingContext(msg: MessageRef): Promise<void> {
        if (this.stateProvider instanceof EpochStateProvider) {
            const rnd = Math.random();
            const m = this.config.batchLingerIntervalMs ?? 1;
            if (rnd < 0.25) {
                await sleep(m * 2);
            } else if (rnd < 0.5) {
                await sleep(m * 4);
            } else if (rnd < 0.75) {
                await sleep(m * 8);
            } else {
                await sleep(m * 16);
            }
        } else {
            await super.handleReprocessingContext(msg);
        }
    }
}
