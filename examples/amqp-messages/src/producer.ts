/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    StaticInputSource,
    IDispatchContext,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { amqpSink } from "@walmartlabs/cookie-cutter-amqp";
import { MessageClass } from "./model";
import * as config from "config";

const AMQP_CONFIG = {
    ...config.get("amqp"),
    encoder: new JsonMessageEncoder(),
};

Application.create()
    .input()
    .add(
        new StaticInputSource([
            {
                type: MessageClass.name,
                payload: new MessageClass("Message #1"),
            },
            {
                type: MessageClass.name,
                payload: new MessageClass("Message #2"),
            },
        ])
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        async onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
            ctx.publish(MessageClass, msg);
        },
    })
    .output()
    .published(amqpSink(AMQP_CONFIG))
    .done()
    .run();
