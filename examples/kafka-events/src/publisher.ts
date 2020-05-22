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
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { KafkaMetadata, kafkaSink } from "@walmartlabs/cookie-cutter-kafka";
import * as m from "./model";

Application.create()
    .input()
    .add(
        new StaticInputSource([
            {
                type: m.CustomerRegistered.name,
                payload: new m.CustomerRegistered("jdoe", "John Doe"),
            },
            {
                type: m.OrderPlaced.name,
                payload: new m.OrderPlaced("jdoe", 42.17),
            },
        ])
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onCustomerRegistered: (msg: m.CustomerRegistered, ctx: IDispatchContext): void => {
            ctx.publish(m.CustomerRegistered, msg, {
                [KafkaMetadata.Key]: msg.userId,
            });
        },
        onOrderPlaced: (msg: m.OrderPlaced, ctx: IDispatchContext): void => {
            ctx.publish(m.OrderPlaced, msg, {
                [KafkaMetadata.Key]: msg.userId,
            });
        },
    })
    .output()
    .published(
        kafkaSink({
            broker: "MY-BROKER:9092",
            defaultTopic: "test-topic",
            encoder: new JsonMessageEncoder(),
        })
    )
    .done()
    .run();
