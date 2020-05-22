/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import _ = require("lodash");
import { Tracer } from "opentracing";
import { IApplicationBuilder, IComponentBuilder, ISpanTags, ITracingBuilder } from "../model";
import { TracerDecorator } from "./TracerDecorator";

export class TracingBuilder implements ITracingBuilder, IComponentBuilder<Tracer> {
    private tracer: Tracer;
    private tracerSet: boolean;
    private readonly globalTags: ISpanTags[] = [];

    constructor(private readonly parent: IApplicationBuilder) {
        this.tracer = new Tracer();
        this.tracerSet = false;
    }

    public done(): IApplicationBuilder {
        return this.parent;
    }

    public annotate(globalTags: ISpanTags): ITracingBuilder {
        this.globalTags.push(globalTags);
        return this;
    }

    public set(tracer: Tracer): ITracingBuilder {
        this.tracer = tracer;
        this.tracerSet = true;
        return this;
    }

    public build(): Tracer {
        const globalTags = {};
        for (const tags of this.globalTags) {
            _.merge(globalTags, tags);
        }
        return new TracerDecorator(this.tracer, globalTags);
    }

    public get hasTracer(): boolean {
        return this.tracerSet;
    }
}
