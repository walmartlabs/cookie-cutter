/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config } from "@walmartlabs/cookie-cutter-core";

export interface IPrometheusConfiguration {
    /**
     * Port where metrics are exposed (default 3000)
     *
     * @type {number}
     * @memberof IPrometheusConfiguration
     */
    readonly port?: number;
    /**
     * Endpoint where metrics are stored (default /metrics)
     *
     * @type {string}
     * @memberof IStatsdClientOptions
     */
    readonly endpoint?: string;
    /**
     * Prefix for time series
     *
     * @type {string}
     * @memberof IPrometheusConfiguration
     */
    readonly prefix?: string;
    /**
     * Controls the resolution of recorded timing data by defining
     * the amount and width of buckets in the histogram. For example,
     * a single bucket would only measure whether observations
     * were greater or less than that bucket value (low resolution).
     *
     * Defaults to `0.050, 0.200, 0.500, 1, 5, 30, 100` (note that seconds
     * are the base unit for timing data in Prometheus).
     *
     * @type {number[]}
     * @memberof IPrometheusConfiguration
     */
    readonly histogramBuckets?: number[];
}

@config.section
export class PrometheusConfiguration implements IPrometheusConfiguration {
    @config.field(config.converters.number)
    public set port(_: number) {
        config.noop();
    }
    public get port(): number {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set endpoint(_: string) {
        config.noop();
    }
    public get endpoint(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set prefix(_: string) {
        config.noop();
    }
    public get prefix(): string {
        return config.noop();
    }

    @config.field(config.converters.listOf(config.converters.number))
    public set histogramBuckets(_: number[]) {
        config.noop();
    }
    public get histogramBuckets(): number[] {
        return config.noop();
    }
}
