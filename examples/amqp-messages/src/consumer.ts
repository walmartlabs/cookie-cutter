/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { amqpSource } from "@walmartlabs/cookie-cutter-amqp";
import { MessageClass } from "./model";

// Before running this example, please adjust the code to include your AMQP Broker (RabbitMQ) connection details.
const AMQP_CONFIG = {
    server: {
        host: "localhost",
    },
    queue: {
        name: "defaultQueueName",
    },
    encoder: new JsonMessageEncoder(),
};

Application.create()
    .input()
    .add(amqpSource(AMQP_CONFIG))
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onMessageClass(msg: MessageClass, ctx: IDispatchContext<any>) {
            ctx.logger.info("Source", { payload: msg.contents });
        },
    })
    .run();
