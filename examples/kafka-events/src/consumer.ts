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
import { kafkaSource } from "@walmartlabs/cookie-cutter-kafka";
import * as m from "./model";

Application.create()
    .input()
    .add(
        kafkaSource({
            broker: "MY-BROKER:9092",
            topics: "test-topic",
            encoder: new JsonMessageEncoder(),
            group: "test-group-1",
        })
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onCustomerRegistered: (msg: m.CustomerRegistered, ctx: IDispatchContext): void => {
            ctx.logger.info(`user ${msg.userId} registered`);
        },
        onOrderPlaced: (msg: m.OrderPlaced, ctx: IDispatchContext): void => {
            ctx.logger.info(`user ${msg.userId} placed an order`);
        },
    })
    .run();
