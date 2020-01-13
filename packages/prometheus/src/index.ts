/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    DefaultComponentContext,
    IComponentContext,
    IDisposable,
    ILogger,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
} from "@walmartlabs/cookie-cutter-core";
import { Counter, Gauge, Histogram, register } from "prom-client";
import { isNumber } from "util";
import { IPrometheusConfiguration, PrometheusConfiguration } from "./config";
import { HttpServer } from "./HttpServer";

class PrometheusMetrics implements IMetrics, IRequireInitialization, IDisposable {
    private logger: ILogger;
    private httpServer: HttpServer;

    constructor(private readonly config: PrometheusConfiguration) {
        this.logger = DefaultComponentContext.logger;
        this.httpServer = undefined;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;

        this.httpServer = HttpServer.create(this.config.port, this.config.endpoint, () =>
            register.metrics()
        );

        this.logger.info("Prometheus Endpoint Initialized", {
            port: this.config.port,
            endpoint: this.config.endpoint,
            prefix: this.config.prefix,
        });
    }

    public increment(key: string, tags?: IMetricTags): void;
    public increment(key: string, value: number, tags?: IMetricTags): void;
    /**
     * increment adds 1 to a counter when no specific value is given.
     * Any positive value can be passed in. Passing in a negative
     * value will result in an error.
     *
     * @param {string} key
     * @param {*} [valueOrTags]
     * @param {IMetricTags} [tags]
     * @memberof PrometheusMetrics
     */
    public increment(key: string, valueOrTags?: any, tags?: IMetricTags): void {
        let val = 1;
        if (valueOrTags !== undefined) {
            if (isNumber(valueOrTags)) {
                val = valueOrTags;
            } else {
                tags = valueOrTags;
            }
        }

        const prefixedKey = this.getPrefixedKey(key);

        try {
            let counter: Counter = register.getSingleMetric(prefixedKey) as Counter;
            if (!counter) {
                counter = new Counter({
                    name: prefixedKey,
                    help: prefixedKey,
                    labelNames: tags ? Object.keys(tags) : [],
                });
            }
            counter.inc(tags ? tags : {}, val, Date.now());
        } catch (err) {
            this.logger.error("Prometheus Counter Error", err, { key, value: val, tags });
        }
    }

    /**
     * A gauge is a metric that can increase or decrease over time (think CPU utilization)
     * @param {string} key The key of the metric
     * @param {number} value The value to set this gauge to
     * @param {IMetricTags} tags Any tags associated with this metric
     */
    public gauge(key: string, value: number, tags?: IMetricTags): void {
        const prefixedKey = this.getPrefixedKey(key);

        try {
            let gauge: Gauge = register.getSingleMetric(prefixedKey) as Gauge;
            if (!gauge) {
                gauge = new Gauge({
                    name: prefixedKey,
                    help: prefixedKey,
                    labelNames: tags ? Object.keys(tags) : [],
                });
            }
            gauge.set(tags ? tags : {}, value, Date.now());
        } catch (err) {
            this.logger.error("Prometheus Gauge Error", err, { key, value, tags });
        }
    }

    /**
     * A Prometheus [Histogram](https://prometheus.io/docs/concepts/metric_types/#histogram) with
     * buckets defined when this class is instantiated.
     * @param {string} key The key of the metric
     * @param {number} value The observation (in seconds) to record
     * @param {IMetricTags} tags The tag values to associate with this observation
     */
    public timing(key: string, value: number, tags?: IMetricTags): void {
        const prefixedKey = this.getPrefixedKey(key);

        try {
            let histogram: Histogram = register.getSingleMetric(prefixedKey) as Histogram;
            if (!histogram) {
                histogram = new Histogram({
                    name: prefixedKey,
                    help: prefixedKey,
                    labelNames: tags ? Object.keys(tags) : [],
                    // TODO: This should be configurable per-histogram, but would require breaking `IMetrics`
                    buckets: this.config.histogramBuckets,
                });
            }
            histogram.observe(tags ? tags : {}, value);
        } catch (err) {
            this.logger.error("Prometheus Histogram Error", err, { key, value, tags });
        }
    }

    private getPrefixedKey(key: string) {
        return `${this.config.prefix}${this.santizeKey(key)}`;
    }

    private santizeKey(key: string) {
        return key.replace(/\./g, "_");
    }

    public async dispose(): Promise<void> {
        if (this.httpServer) {
            await this.httpServer.close();
        }
    }
}

export function prometheus(prometheusConfig: IPrometheusConfiguration): IMetrics {
    const defaults: IPrometheusConfiguration = {
        port: 3000,
        endpoint: "/metrics",
        prefix: "",
        histogramBuckets: [0.05, 0.2, 0.5, 1, 5, 30, 100],
    };
    return new PrometheusMetrics(config.parse(PrometheusConfiguration, prometheusConfig, defaults));
}
