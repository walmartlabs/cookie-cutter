/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMetrics, IMetricTags } from "../model";

interface IRecordedMetric {
    method: string;
    params: {
        key: string;
        value: number | IMetricTags;
        tags: IMetricTags;
    };
}
export class BufferedMetrics implements IMetrics {
    private recordedMetrics: IRecordedMetric[] = [];

    public constructor(private metrics: IMetrics) {}

    public increment(key: string, valueOrTags?: number | IMetricTags, tags?: IMetricTags): void {
        this.recordedMetrics.push({
            method: this.increment.name,
            params: {
                key,
                value: valueOrTags,
                tags,
            },
        });
    }

    public gauge(key: string, value: number, tags?: IMetricTags): void {
        this.recordedMetrics.push({
            method: this.gauge.name,
            params: {
                key,
                value,
                tags,
            },
        });
    }

    public timing(key: string, value: number, tags?: IMetricTags): void {
        this.recordedMetrics.push({
            method: this.timing.name,
            params: {
                key,
                value,
                tags,
            },
        });
    }

    public flush() {
        for (const metric of this.recordedMetrics) {
            this.metrics[metric.method](metric.params.key, metric.params.value, metric.params.tags);
        }
        this.recordedMetrics.length = 0;
    }

    public clear() {
        this.recordedMetrics.length = 0;
    }
}
