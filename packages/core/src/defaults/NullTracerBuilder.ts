/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Tracer } from "opentracing";
import { ITracerBuilder } from "../model";

export class NullTracerBuilder implements ITracerBuilder {
    public create(): Tracer {
        return new Tracer();
    }
}
