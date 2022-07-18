/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { CompositeInputSource } from ".";
import { NullMessageDeduper } from "../defaults";
import {
    IApplicationBuilder,
    IComponentBuilder,
    IInputBuilder,
    IInputSource,
    IMessageDeduper,
    IMessageEnricher,
    IMessageMetricAnnotator,
    Lifecycle,
    makeLifecycle,
} from "../model";

export class InputBuilder
    implements IInputBuilder, IComponentBuilder<IInputSource & IMessageMetricAnnotator>
{
    private readonly inputs: Lifecycle<IInputSource>[] = [];
    private readonly enrichers: IMessageEnricher[] = [];
    private readonly annotators: IMessageMetricAnnotator[] = [];
    private deduper: IMessageDeduper;

    constructor(private readonly parent: IApplicationBuilder) {
        this.deduper = new NullMessageDeduper();
    }

    public done(): IApplicationBuilder {
        return this.parent;
    }

    public build(): Lifecycle<IInputSource & IMessageMetricAnnotator> {
        return new CompositeInputSource(
            this.inputs,
            this.enrichers,
            this.annotators,
            makeLifecycle(this.deduper)
        );
    }

    public add(source: IInputSource): IInputBuilder {
        this.inputs.push(makeLifecycle(source));
        return this;
    }

    public enrich(enricher: IMessageEnricher): IInputBuilder {
        this.enrichers.push(enricher);
        return this;
    }

    public annotate(annotator: IMessageMetricAnnotator): IInputBuilder {
        this.annotators.push(annotator);
        return this;
    }

    public dedupe(deduper: IMessageDeduper): IInputBuilder {
        this.deduper = deduper;
        return this;
    }
}
