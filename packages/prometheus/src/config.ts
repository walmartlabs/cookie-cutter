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
     * Prefix for time series (default '')
     *
     * @type {string}
     * @memberof IPrometheusConfiguration
     */
    readonly prefix?: string;
    /**
     * Defines default histrogram buckets.
     * Each bucket is defined by it's inclusive upper bound.
     *
     * Defaults to `0.050, 0.200, 0.500, 1, 5, 30, 100` (note that seconds
     * are the base unit for timing data in Prometheus).
     *
     * @type {number[]}
     * @memberof IPrometheusConfiguration
     */
    readonly defaultHistogramBuckets?: number[];
    /**
     * Defines a map between keys and histogram buckets to use instead of the default.
     * All metrics with the same key (regardless of lables) will share the same histogram.
     *
     * Defaults to empty map.
     *
     * @type {Map<string, number[]>}
     * @memberof IPrometheusConfiguration
     */
    readonly mapOfHistogramBucketsPerKey?: Map<string, number[]>;
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
    public set defaultHistogramBuckets(_: number[]) {
        config.noop();
    }
    public get defaultHistogramBuckets(): number[] {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set mapOfHistogramBucketsPerKey(_: Map<string, number[]>) {
        config.noop();
    }
    public get mapOfHistogramBucketsPerKey(): Map<string, number[]> {
        return config.noop();
    }
}
