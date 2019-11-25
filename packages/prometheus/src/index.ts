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
import { Counter, Gauge, register, Summary } from "prom-client";
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
            this.logger.error("Prometheus Error", err, { key, value: val, tags });
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
            this.logger.error("Prometheus Error", err, { key, value, tags });
        }
    }

    /**
     * Timing is implemented as a summary w/ percentiles of .5, .95, and .99
     * Count and total counters are also added
     */
    public timing(key: string, value: number, tags?: IMetricTags): void {
        const prefixedKey = this.getPrefixedKey(key);

        try {
            let summary: Summary = register.getSingleMetric(prefixedKey) as Summary;
            if (!summary) {
                summary = new Summary({
                    name: prefixedKey,
                    help: prefixedKey,
                    labelNames: tags ? Object.keys(tags) : [],
                    percentiles: [0.5, 0.95, 0.99],
                });
            }
            summary.observe(tags ? tags : {}, value);

            this.increment(`${key}_total`, value, tags);
            this.increment(`${key}_count`, tags);
        } catch (err) {
            this.logger.error("Prometheus Error", err, { key, value, tags });
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
    };
    return new PrometheusMetrics(config.parse(PrometheusConfiguration, prometheusConfig, defaults));
}
