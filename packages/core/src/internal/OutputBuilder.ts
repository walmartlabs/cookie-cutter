/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext, CompositeOutputSink } from ".";
import { NullOutputSink } from "../defaults";
import {
    IApplicationBuilder,
    IComponentBuilder,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IOutputBuilder,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IStateVerification,
    IStoredMessage,
    Lifecycle,
    makeLifecycle,
    OutputSinkConsistencyLevel,
} from "../model";
import { EpochManager } from "./EpochManager";

export class OutputBuilder
    implements
        IOutputBuilder,
        IComponentBuilder<Lifecycle<IOutputSink<BufferedDispatchContext>> & IMessageEnricher>
{
    private publishSink: Lifecycle<IOutputSink<IPublishedMessage>>;
    private storeSink: Lifecycle<IOutputSink<IStoredMessage | IStateVerification>>;
    private storeSinkSet: boolean;
    private publishSinkSet: boolean;
    private readonly enrichers: IMessageEnricher[] = [];
    private readonly annotators: IMessageMetricAnnotator[] = [];
    public readonly epochs: EpochManager;

    constructor(private readonly parent: IApplicationBuilder) {
        this.publishSink = makeLifecycle(new NullOutputSink());
        this.storeSink = makeLifecycle(new NullOutputSink());
        this.storeSinkSet = false;
        this.publishSinkSet = false;
        this.epochs = new EpochManager();
    }

    public done(): IApplicationBuilder {
        return this.parent;
    }

    public stored(sink: IOutputSink<IStoredMessage | IStateVerification>): IOutputBuilder {
        this.storeSink = makeLifecycle(sink);
        this.storeSinkSet = true;
        return this;
    }

    public published(sink: IOutputSink<IPublishedMessage>): IOutputBuilder {
        this.publishSink = makeLifecycle(sink);
        this.publishSinkSet = true;
        return this;
    }

    public build(): Lifecycle<IOutputSink<BufferedDispatchContext>> & IMessageEnricher {
        return new CompositeOutputSink(
            this.enrichers,
            this.annotators,
            this.publishSink,
            this.storeSink,
            this.guarantees,
            this.epochs
        );
    }

    public enrich<T extends IMessageEnricher>(enricher: T): IOutputBuilder {
        this.enrichers.push(enricher);
        return this;
    }

    public annotate(annotator: IMessageMetricAnnotator): IOutputBuilder {
        this.annotators.push(annotator);
        return this;
    }

    public get hasStoreSink(): boolean {
        return this.storeSinkSet;
    }

    private get guarantees(): IOutputSinkGuarantees {
        const s = this.storeSink.guarantees;
        const p = this.publishSink.guarantees;

        let maxBatchSize: number | undefined;
        if (s.maxBatchSize !== undefined && p.maxBatchSize !== undefined) {
            maxBatchSize = Math.min(s.maxBatchSize, p.maxBatchSize);
        } else if (s.maxBatchSize !== undefined) {
            maxBatchSize = s.maxBatchSize;
        } else {
            maxBatchSize = p.maxBatchSize;
        }

        let consistency: OutputSinkConsistencyLevel;
        if (this.storeSinkSet && this.publishSinkSet) {
            consistency = OutputSinkConsistencyLevel.None;
        } else if (this.storeSinkSet) {
            consistency = s.consistency;
        } else {
            consistency = p.consistency;
        }

        return {
            maxBatchSize,
            idempotent: s.idempotent && p.idempotent,
            consistency,
        };
    }
}
