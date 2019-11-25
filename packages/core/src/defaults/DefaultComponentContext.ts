/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Tracer } from "opentracing";
import { IComponentContext } from "../model";
import { NullLogger } from "./NullLogger";
import { NullMetrics } from "./NullMetrics";

export const DefaultComponentContext: IComponentContext = {
    logger: new NullLogger(),
    metrics: new NullMetrics(),
    tracer: new Tracer(),
};
