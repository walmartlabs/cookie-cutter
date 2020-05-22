/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import _ = require("lodash");
import { Span, SpanOptions, Tracer } from "opentracing";
import { ISpanTags } from "../model";

export class TracerDecorator extends Tracer {
    constructor(private inner: Tracer, private readonly globalTags: ISpanTags) {
        super();
    }

    public startSpan(name: string, options: SpanOptions = {}): Span {
        let tags = this.globalTags;
        if (options.tags) {
            tags = _.merge(options.tags, tags);
        }
        return this.inner.startSpan(name, { ...options, tags });
    }
}
