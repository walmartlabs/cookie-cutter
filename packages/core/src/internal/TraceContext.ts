/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Span, SpanContext, Tracer } from "opentracing";
import { ITracing } from "../model/tracing";

export class TraceContext implements ITracing {
    constructor(private tracer: Tracer, private readonly current: Span) {}

    public addTags(items: { [key: string]: any }): void {
        this.current.addTags(items);
    }

    public child(name: string, parent?: Span | SpanContext): Span {
        return this.tracer.startSpan(name, { childOf: parent || this.current });
    }

    public get context(): SpanContext {
        return this.current.context();
    }
}
