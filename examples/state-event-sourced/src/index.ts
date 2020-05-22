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
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { CommandHandler } from "./handler";
import * as m from "./model";

const STORAGE = new Map();

// tslint:disable:no-console
// tslint:disable:no-floating-promises
Application.create()
    .input()
    .add(
        new StaticInputSource([
            {
                type: m.Signup.name,
                payload: new m.Signup("jdoe"),
            },
            {
                type: m.PutInCart.name,
                payload: new m.PutInCart("jdoe", "cookies", 3.48),
            },
            {
                type: m.PutInCart.name,
                payload: new m.PutInCart("jdoe", "soap", 5.81),
            },
            {
                type: m.Checkout.name,
                payload: new m.Checkout("jdoe", "credit card ****** 0472"),
            },
            {
                type: m.Signup.name,
                payload: new m.Signup("jdoe"),
            },
            {
                type: m.PutInCart.name,
                payload: new m.PutInCart("jdoe", "gum", 1.35),
            },
        ])
    )
    .done()
    .state(
        cached(
            m.UserState,
            new EventSourcedStateProvider(
                m.UserState,
                new m.UserStateAggregator(),
                new InMemoryStateAggregationSource(STORAGE)
            )
        )
    )
    .dispatch(new CommandHandler())
    .logger(new ConsoleLogger())
    .output()
    .stored(new InMemoryStateOutputSink(STORAGE))
    .done()
    .run()
    .then(() => console.log("content of storage", STORAGE));
