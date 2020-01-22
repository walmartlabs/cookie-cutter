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
import { isNull, isNumber, isString, isUndefined } from "util";
import { IPrometheusConfiguration, PrometheusConfiguration } from "./config";
import { HttpServer } from "./HttpServer";
import {
    CounterSet,
    GaugeSet,
    HistogramSet,
    ICounterSet,
    IGaugeSet,
    IHistogramSet,
    ILabelValues,
    IPrometheusMetric,
} from "./models";

class PrometheusMetrics
    implements IPrometheusMetric, IMetrics, IRequireInitialization, IDisposable {
    private logger: ILogger;
    private httpServer: HttpServer;
    private keyBucketsMap: Map<string, number[]>;
    private counterSets: Map<string, ICounterSet>;
    private gaugeSets: Map<string, IGaugeSet>;
    private histogramSets: Map<string, IHistogramSet>;

    constructor(private readonly config: PrometheusConfiguration) {
        this.logger = DefaultComponentContext.logger;
        this.httpServer = undefined;
        this.keyBucketsMap = config.histogramBucketsMap || new Map<string, number[]>();
        this.counterSets = new Map<string, ICounterSet>();
        this.gaugeSets = new Map<string, IGaugeSet>();
        this.histogramSets = new Map<string, IHistogramSet>();
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;

        this.httpServer = HttpServer.create(this.config.port, this.config.endpoint, () =>
            this.toPrometheusString()
        );

        this.logger.info("Prometheus Endpoint Initialized", {
            port: this.config.port,
            endpoint: this.config.endpoint,
            prefix: this.config.prefix,
        });
    }

    public toPrometheusString(): string {
        let str = "";
        for (const counterSet of this.counterSets.values()) {
            str += counterSet.toPrometheusString();
        }
        for (const gaugeSet of this.gaugeSets.values()) {
            str += gaugeSet.toPrometheusString();
        }
        for (const histogramSet of this.histogramSets.values()) {
            str += histogramSet.toPrometheusString();
        }
        return str;
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
        let value = 1;
        if (valueOrTags !== undefined) {
            if (isNumber(valueOrTags)) {
                value = valueOrTags;
            } else {
                tags = valueOrTags;
            }
        }
        if (value <= 0) {
            const str = "Prometheus Counter Error";
            const err = "Incrementing a Counter with a non-positive value is not allowed.";
            this.logger.error(str, new Error(err), { key, value, tags });
            return;
        }

        const prefixedKey = this.getPrefixedKey(key);
        let counterSet = this.counterSets.get(prefixedKey);
        if (!counterSet) {
            counterSet = new CounterSet(prefixedKey);
        }
        counterSet.increment(prefixedKey, value, this.convertToLabels(tags));
        this.counterSets.set(prefixedKey, counterSet);
    }

    /**
     * A gauge is a metric that can increase or decrease over time (think CPU utilization)
     * @param {string} key The key of the metric
     * @param {number} value The value to set this gauge to
     * @param {IMetricTags} tags Any tags associated with this metric
     */
    public gauge(key: string, value: number, tags?: IMetricTags): void {
        const prefixedKey = this.getPrefixedKey(key);
        let gaugeSet = this.gaugeSets.get(prefixedKey);
        if (!gaugeSet) {
            gaugeSet = new GaugeSet(prefixedKey);
        }
        gaugeSet.set(prefixedKey, value, this.convertToLabels(tags));
        this.gaugeSets.set(prefixedKey, gaugeSet);
    }

    /**
     * A Prometheus [Histogram](https://prometheus.io/docs/concepts/metric_types/#histogram) with
     * buckets defined when this class is instantiated.
     * @param {string} key The key of the metric
     * @param {number} value The observation (in seconds) to record
     * @param {IMetricTags} tags The tag values to associate with this observation
     */
    public timing(key: string, value: number, tags?: IMetricTags): void {
        const str = "Prometheus Histogram Error";
        if (value < 0) {
            const err = "Observing a negative value is not allowed for Histograms.";
            this.logger.error(str, new Error(err), { key, value, tags });
            return;
        }
        if (this.containsLeLabel(tags)) {
            const err = "The 'le' label is reserved for system use in histograms.";
            this.logger.error(str, new Error(err), { key, value, tags });
            return;
        }
        const prefixedKey = this.getPrefixedKey(key);
        let histogramSet = this.histogramSets.get(prefixedKey);
        if (!histogramSet) {
            histogramSet = new HistogramSet(prefixedKey, this.lookupBuckets(key));
        }
        histogramSet.observe(prefixedKey, value, this.convertToLabels(tags));
        this.histogramSets.set(prefixedKey, histogramSet);
    }

    private getPrefixedKey(key: string) {
        return `${this.config.prefix}${this.sanitizeKey(key)}`;
    }

    private sanitizeKey(key: string) {
        return key.replace(/\./g, "_");
    }

    private lookupBuckets(key: string): number[] {
        const buckets = this.keyBucketsMap.get(key);
        if (!buckets) {
            return this.config.defaultHistogramBuckets;
        }
        return buckets;
    }

    // checks if the "less than or equal to" label ["le"] for histogram buckets is part of the input tags
    private containsLeLabel(tags: IMetricTags): boolean {
        const le = ["le", "Le", "lE", "LE"];
        return tags ? tags[le[0]] || tags[le[1]] || tags[le[2]] || tags[le[3]] : false;
    }

    private convertToLabels(tags: IMetricTags): ILabelValues {
        if (!tags) {
            return undefined;
        }
        const labels: ILabelValues = {};
        for (const key of Object.keys(tags)) {
            if (isNumber(tags[key]) || isString(tags[key])) {
                labels[key] = tags[key];
            } else if (isUndefined(tags[key])) {
                labels[key] = "undefined";
            } else if (isNull(tags[key])) {
                labels[key] = "null";
            } else {
                labels[key] = tags[key].toString();
            }
        }
        return labels;
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
        defaultHistogramBuckets: [0.05, 0.2, 0.5, 1, 5, 30, 100],
    };
    return new PrometheusMetrics(config.parse(PrometheusConfiguration, prometheusConfig, defaults));
}
