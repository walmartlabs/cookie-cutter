/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Counter, Gauge, Histogram, labelValues, register } from "prom-client";
import { prometheus } from "..";
import { nextPort, prometheusConfiguration } from "./helper";

describe("Prometheus", () => {
    beforeEach(() => {
        register.clear();
    });

    it("increments counters", async () => {
        const counterName = "theCounter";
        const config = prometheusConfiguration(nextPort());
        const prefixedCounterName = `${config.prefix}${counterName}`;
        const p = prometheus(config);
        p.increment(counterName);
        const counterState = register.getSingleMetric(prefixedCounterName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${counterName}`,
            hashMap: {
                "": {
                    labels: {},
                    timestamp: expect.any(Number),
                    value: 1,
                },
            },
        });
    });

    it("increments counters by the specified amount", async () => {
        const counterName = "theCounter";
        const config = prometheusConfiguration(nextPort());
        const prefixedCounterName = `${config.prefix}${counterName}`;
        const p = prometheus(config);
        p.increment(counterName);
        p.increment(counterName, 50);
        const counterState = register.getSingleMetric(prefixedCounterName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${counterName}`,
            hashMap: {
                "": {
                    labels: {},
                    timestamp: expect.any(Number),
                    value: 51,
                },
            },
        });
    });

    it("fails to increment counters with negative numbers", async () => {
        const counterName = "theCounter";
        const config = prometheusConfiguration(nextPort());
        const prefixedCounterName = `${config.prefix}${counterName}`;
        const p = prometheus(config);
        p.increment(counterName);
        p.increment(counterName);
        p.increment(counterName, -1);
        const counterState = register.getSingleMetric(prefixedCounterName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${counterName}`,
            hashMap: {
                "": {
                    labels: {},
                    timestamp: expect.any(Number),
                    value: 2,
                },
            },
        });
    });

    it("handles counters with labels with properly", async () => {
        const counterName = "theCounter";
        const projectOneLabel: labelValues = { project: "projectOne" };
        const projectTwoLabel: labelValues = { project: "projectTwo" };
        const config = prometheusConfiguration(nextPort());
        const prefixedCounterName = `${config.prefix}${counterName}`;
        const p = prometheus(config);
        p.increment(counterName, projectOneLabel);
        p.increment(counterName, 12, projectTwoLabel);
        p.increment(counterName, projectOneLabel);
        const counterState = register.getSingleMetric(prefixedCounterName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${counterName}`,
            hashMap: {
                "project:projectOne": {
                    labels: projectOneLabel,
                    timestamp: expect.any(Number),
                    value: 2,
                },
                "project:projectTwo": {
                    labels: projectTwoLabel,
                    timestamp: expect.any(Number),
                    value: 12,
                },
            },
        });
    });

    it("fails to increment a metric with a new label after creation", async () => {
        const counterName = "theCounter";
        const projectOneLabel: labelValues = { project: "projectOne" };
        const projectTwoLabel: labelValues = { project: "projectTwo", another: "label" };
        const config = prometheusConfiguration(nextPort());
        const prefixedCounterName = `${config.prefix}${counterName}`;
        const p = prometheus(config);
        p.increment(counterName, projectOneLabel);
        p.increment(counterName, 12, projectTwoLabel);
        const counterState = register.getSingleMetric(prefixedCounterName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${counterName}`,
            hashMap: {
                "project:projectOne": {
                    labels: projectOneLabel,
                    timestamp: expect.any(Number),
                    value: 1,
                },
            },
        });
    });

    it("properly sets gauges", async () => {
        const gaugeName = "theGauge";
        const config = prometheusConfiguration(nextPort());
        const prefixedGaugeName = `${config.prefix}${gaugeName}`;
        const p = prometheus(config);
        p.gauge(gaugeName, 33);
        const gaugeState = register.getSingleMetric(prefixedGaugeName) as Gauge;
        expect(gaugeState).toMatchObject({
            name: `${config.prefix}${gaugeName}`,
            hashMap: {
                "": {
                    labels: {},
                    timestamp: expect.any(Number),
                    value: 33,
                },
            },
        });
    });

    it("handles gauges with labels with properly", async () => {
        const gaugeName = "theGauge";
        const projectOneLabel: labelValues = { project: "projectOne" };
        const projectTwoLabel: labelValues = { project: "projectTwo" };
        const config = prometheusConfiguration(nextPort());
        const prefixedGaugeName = `${config.prefix}${gaugeName}`;
        const p = prometheus(config);
        p.gauge(gaugeName, 33, projectOneLabel);
        p.gauge(gaugeName, 12, projectTwoLabel);
        const counterState = register.getSingleMetric(prefixedGaugeName) as Counter;
        expect(counterState).toMatchObject({
            name: `${config.prefix}${gaugeName}`,
            hashMap: {
                "project:projectOne": {
                    labels: projectOneLabel,
                    timestamp: expect.any(Number),
                    value: 33,
                },
                "project:projectTwo": {
                    labels: projectTwoLabel,
                    timestamp: expect.any(Number),
                    value: 12,
                },
            },
        });
    });

    it("handles timing", async () => {
        const timingName = "theTiming";
        const config = prometheusConfiguration(nextPort());
        const p = prometheus(config);
        const prefixedTimingName = `${config.prefix}${timingName}`;
        p.timing(timingName, 33);
        p.timing(timingName, 10);
        p.timing(timingName, 11);
        p.timing(timingName, 12);
        const histogramState = register.getSingleMetric(prefixedTimingName) as Histogram;
        expect(histogramState).toMatchObject({
            name: `${config.prefix}${timingName}`,
            hashMap: {
                "": {
                    count: 4, // Not really great criteria, but shows we observed 4 items
                    sum: 66,
                    labels: {},
                },
            },
        });
    });
});
