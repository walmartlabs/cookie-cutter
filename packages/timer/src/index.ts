/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IInputSource, IMessage } from "@walmartlabs/cookie-cutter-core";
import { Interval } from "./Interval";
import { INTERVAL_EVENT_TYPE, IntervalSource } from "./IntervalSource";
export { Interval } from "./Interval";

export interface IInterval {
    readonly eventTime: Date;
    overrideNextTimeout(timeoutMs: number): void;
}

export interface IIntervalConfig {
    readonly timeout: number;
    readonly firstTimeout?: number;
}

@config.section
class IntervalConfig implements IIntervalConfig {
    @config.field(config.converters.timespan)
    public set timeout(_: number) {
        config.noop();
    }
    public get timeout(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set firstTimeout(_: number) {
        config.noop();
    }
    public get firstTimeout(): number {
        return config.noop();
    }
}

export function intervalSource(configuration: IIntervalConfig): IInputSource {
    return new IntervalSource(config.parse(IntervalConfig, configuration));
}

export function mockIntervalMsg(eventTime?: Date): IMessage {
    const payload = new Interval(eventTime || new Date());
    return {
        type: INTERVAL_EVENT_TYPE,
        payload,
    };
}
