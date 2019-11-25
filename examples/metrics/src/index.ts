/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IComponentContext,
    IDispatchContext,
    ILogger,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { isNumber } from "util";

interface IFoo {
    text: string;
}
interface IBar {
    text: string;
}

class LoggedMetrics implements IMetrics, IRequireInitialization {
    private logger: ILogger;

    public async initialize(context: IComponentContext) {
        this.logger = context.logger;
    }

    public increment(key: any, tagsOrValue?: IMetricTags | number, tags?: IMetricTags) {
        let value = 1;
        tags = tags || {};
        if (isNumber(tagsOrValue)) {
            value = tagsOrValue;
        } else {
            tags = tagsOrValue;
        }

        this.logger.info("#METRIC -- increment", { key, value, ...tags });
    }

    public gauge(key: string, value: number, tags?: IMetricTags | undefined): void {
        tags = tags || {};
        this.logger.info("#METRIC -- gauge", { key, value, ...tags });
    }

    public timing(key: string, value: number, tags?: IMetricTags | undefined): void {
        tags = tags || {};
        this.logger.info("#METRIC -- timing", { key, value, ...tags });
    }
}

Application.create()
    .input()
    .add(
        new StaticInputSource([
            { type: "Foo", payload: { text: "hello" } },
            { type: "Bar", payload: { text: "world" } },
        ])
    )
    .done()
    .logger(new ConsoleLogger())
    .metrics(new LoggedMetrics())
    .dispatch({
        onFoo: (msg: IFoo, ctx: IDispatchContext): void => {
            ctx.metrics.gauge("text_length", msg.text.length);
            ctx.logger.info(msg.text);
        },
        onBar: (msg: IBar, ctx: IDispatchContext): void => {
            ctx.metrics.gauge("text_length", msg.text.length);
            ctx.logger.warn(msg.text);
        },
    })
    .run();
