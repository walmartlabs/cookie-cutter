/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    cached,
    ConsoleLogger,
    EventSourcedStateProvider,
    InMemoryStateAggregationSource,
    InMemoryStateOutputSink,
} from "@walmartlabs/cookie-cutter-core";
import { grpcSource } from "@walmartlabs/cookie-cutter-grpc";
import { Handler } from "./handler";
import * as m from "./model";

const STORAGE = new Map();

Application.create()
    .input()
    .add(
        grpcSource({
            host: "localhost",
            port: 5001,
            definitions: [m.TallyServiceDef],
        })
    )
    .done()
    .logger(new ConsoleLogger())
    .state(
        cached(
            m.TallyState,
            new EventSourcedStateProvider(
                m.TallyState,
                new m.TallyAggregator(),
                new InMemoryStateAggregationSource(STORAGE)
            )
        )
    )
    .dispatch(new Handler())
    .output()
    .stored(new InMemoryStateOutputSink(STORAGE))
    .done()
    .run();
