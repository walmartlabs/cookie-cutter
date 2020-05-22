/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Streaming } from "@walmartlabs/cookie-cutter-azure";
import { Application, ConsoleLogger, JsonMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { intervalSource } from "@walmartlabs/cookie-cutter-timer";
import * as config from "config";
import { Handler } from "./handler";

const QUEUE_CONFIG = {
    ...config.get("queue"),
    encoder: new JsonMessageEncoder(),
};

Application.create()
    .input()
    .add(Streaming.queueSource(QUEUE_CONFIG))
    .add(intervalSource({ timeout: "30 seconds", firstTimeout: "1 second" } as any))
    .done()
    .logger(new ConsoleLogger())
    .dispatch(new Handler())
    .output()
    .published(Streaming.queueSink(QUEUE_CONFIG))
    .done()
    .run();
