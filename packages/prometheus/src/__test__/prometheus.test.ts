/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IMetricTags,
    makeLifecycle,
} from "@walmartlabs/cookie-cutter-core";
import { IConfiguredHistogramBuckets } from "../config";
import { prometheus } from "../index";
import { getMetrics, nextPort, prometheusConfiguration } from "./helper";

const mockError = jest.fn();
const mockWarn = jest.fn();
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: mockWarn,
    error: mockError,
};

describe("Prometheus", () => {
    describe("Helper functions", () => {
        it("correctly converts from IMetricsTags to ILabelValues", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize({ ...DefaultComponentContext, logger: mockLogger });
            const tags: IMetricTags = {
                num: 10,
                str: "word",
                emptyStr: "",
                emptyObj: {},
                nullTag: null,
                undefinedTag: undefined,
                obj: { field: "value" },
            };
            const labels: string =
                '{num="10",str="word",emptyObj="[object Object]",obj="[object Object]"}';
            prom.increment(key, tags);
            prom.increment(key, {});
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key counter");
            expect(dataSplit[1].startsWith(`test_key${labels} 1`)).toBe(true);
            expect(dataSplit[2].startsWith(`test_key 1`)).toBe(true);
            expect(mockWarn).toHaveBeenCalledTimes(1);
            const str = "Prometheus Labels of Type other than string or number passed in";
            const data = { listOfLabels: ["emptyObj", "obj"] };
            expect(mockWarn).toHaveBeenNthCalledWith(1, str, data);
        });
    });

    describe("Counter", () => {
        it("does not create/increment a Counter when given a non-positive increment value", async () => {
            const key1 = "key1";
            const key2 = "key2";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize({ ...DefaultComponentContext, logger: mockLogger });
            prom.increment(key1, -1);
            prom.increment(key2, 1);
            prom.increment(key2, -2);
            prom.increment(key2, 0);
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key2 counter");
            expect(dataSplit[1].startsWith("test_key2 1 ")).toBe(true);
            expect(mockError).toHaveBeenCalledTimes(3);
            const str = "Prometheus Counter Error";
            const err = new Error(
                "Incrementing a Counter with a non-positive value is not allowed."
            );
            const data1 = { key: key1, value: -1, tags: undefined };
            const data2 = { key: key2, value: -2, tags: undefined };
            const data3 = { key: key2, value: 0, tags: undefined };
            expect(mockError).toHaveBeenNthCalledWith(1, str, err, data1);
            expect(mockError).toHaveBeenNthCalledWith(2, str, err, data2);
            expect(mockError).toHaveBeenNthCalledWith(3, str, err, data3);
        });

        it("outputs 2 incremented counters", async () => {
            const key1 = "key1";
            const key2 = "key2";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.increment(key1);
            prom.increment(key2);
            prom.increment(key1, 3);
            prom.increment(key2, 5);
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key1 counter");
            expect(dataSplit[1].startsWith("test_key1 4")).toBe(true);
            // [2] empty line
            expect(dataSplit[3]).toBe("# TYPE test_key2 counter");
            expect(dataSplit[4].startsWith("test_key2 6")).toBe(true);
        });

        it("outputs a counter with different label sets", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.increment(key, 10);
            prom.increment(key, 20, { label1: "val1" });
            prom.increment(key, 30, { label1: "val1", label2: "val2" });
            prom.increment(key);
            prom.increment(key, { label1: "val1" });
            prom.increment(key, { label1: "val1", label2: "val2" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key counter");
            expect(dataSplit[1].startsWith("test_key 11")).toBe(true);
            expect(dataSplit[2].startsWith('test_key{label1="val1"} 21')).toBe(true);
            expect(dataSplit[3].startsWith('test_key{label1="val1",label2="val2"} 31')).toBe(true);
        });

        it("outputs a counter with different values for the same labels", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.increment(key, 10, { label1: "val1", label2: "val3" });
            prom.increment(key, 20, { label1: "val2", label2: "val2" });
            prom.increment(key, 30, { label1: "val3", label2: "val1" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key counter");
            expect(dataSplit[1].startsWith('test_key{label1="val1",label2="val3"} 10')).toBe(true);
            expect(dataSplit[2].startsWith('test_key{label1="val2",label2="val2"} 20')).toBe(true);
            expect(dataSplit[3].startsWith('test_key{label1="val3",label2="val1"} 30')).toBe(true);
        });
    });

    describe("Gauge", () => {
        it("outputs 2 set gauges", async () => {
            const key1 = "key1";
            const key2 = "key2";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.gauge(key1, 1);
            prom.gauge(key2, 2);
            prom.gauge(key1, 3);
            prom.gauge(key2, 5);
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key1 gauge");
            expect(dataSplit[1].startsWith("test_key1 3")).toBe(true);
            // [2] empty line
            expect(dataSplit[3]).toBe("# TYPE test_key2 gauge");
            expect(dataSplit[4].startsWith("test_key2 5")).toBe(true);
        });

        it("outputs a gauge with different label sets", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.gauge(key, 10);
            prom.gauge(key, 20, { label1: "val1" });
            prom.gauge(key, 30, { label1: "val1", label2: "val2" });
            prom.gauge(key, 1);
            prom.gauge(key, 2, { label1: "val1" });
            prom.gauge(key, 3, { label1: "val1", label2: "val2" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key gauge");
            expect(dataSplit[1].startsWith("test_key 1")).toBe(true);
            expect(dataSplit[2].startsWith('test_key{label1="val1"} 2')).toBe(true);
            expect(dataSplit[3].startsWith('test_key{label1="val1",label2="val2"} 3')).toBe(true);
        });

        it("outputs a gauge with different values for the same labels", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.gauge(key, 0.1, { label1: "val1", label2: "val3" });
            prom.gauge(key, 0.2, { label1: "val2", label2: "val2" });
            prom.gauge(key, 0.3, { label1: "val3", label2: "val1" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key gauge");
            expect(dataSplit[1].startsWith('test_key{label1="val1",label2="val3"} 0.1')).toBe(true);
            expect(dataSplit[2].startsWith('test_key{label1="val2",label2="val2"} 0.2')).toBe(true);
            expect(dataSplit[3].startsWith('test_key{label1="val3",label2="val1"} 0.3')).toBe(true);
        });

        it("outputs different values at different times for a gauge", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.gauge(key, 10);
            const dataSplit1 = (await getMetrics(port)).split("\n");
            prom.gauge(key, 0);
            const dataSplit2 = (await getMetrics(port)).split("\n");
            prom.gauge(key, -10);
            const dataSplit3 = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit1[0]).toBe("# TYPE test_key gauge");
            expect(dataSplit1[1].startsWith("test_key 10")).toBe(true);
            expect(dataSplit2[0]).toBe("# TYPE test_key gauge");
            expect(dataSplit2[1].startsWith("test_key 0")).toBe(true);
            expect(dataSplit3[0]).toBe("# TYPE test_key gauge");
            expect(dataSplit3[1].startsWith("test_key -10")).toBe(true);
        });
    });

    describe("Histogram", () => {
        it("does not create a Histogram when given a label set containing 'le'", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize({ ...DefaultComponentContext, logger: mockLogger });
            prom.timing(key, 1, { le: "none" });
            prom.timing(key, 1, { lE: "none" });
            prom.timing(key, 1, { Le: "none" });
            prom.timing(key, 1, { LE: "none" });
            await prom.dispose();
            expect(mockError).toHaveBeenCalledTimes(4);
            const str = "Prometheus Histogram Error";
            const err = new Error("The 'le' label is reserved for system use in histograms.");
            const data1 = { key, value: 1, tags: { le: "none" } };
            const data2 = { key, value: 1, tags: { lE: "none" } };
            const data3 = { key, value: 1, tags: { Le: "none" } };
            const data4 = { key, value: 1, tags: { LE: "none" } };
            expect(mockError).toHaveBeenNthCalledWith(1, str, err, data1);
            expect(mockError).toHaveBeenNthCalledWith(2, str, err, data2);
            expect(mockError).toHaveBeenNthCalledWith(3, str, err, data3);
            expect(mockError).toHaveBeenNthCalledWith(4, str, err, data4);
        });

        it("does not create/observe a Histogram when given a negative observation value", async () => {
            const key1 = "key1";
            const key2 = "key2";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize({ ...DefaultComponentContext, logger: mockLogger });
            prom.timing(key1, -10);
            prom.timing(key2, 20);
            prom.timing(key2, -10);
            prom.timing(key2, 0);
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key2 histogram");
            expect(dataSplit[1].startsWith('test_key2_bucket{le="10"} 1')).toBe(true);
            expect(dataSplit[2].startsWith('test_key2_bucket{le="20"} 2')).toBe(true);
            expect(dataSplit[3].startsWith('test_key2_bucket{le="+Inf"} 2')).toBe(true);
            expect(dataSplit[4].startsWith("test_key2_sum 20")).toBe(true);
            expect(dataSplit[5].startsWith("test_key2_count 2")).toBe(true);
            expect(mockError).toHaveBeenCalledTimes(2);
            const str = "Prometheus Histogram Error";
            const err = new Error("Observing a negative value is not allowed for Histograms.");
            const data1 = { key: key1, value: -10, tags: undefined };
            const data2 = { key: key2, value: -10, tags: undefined };
            expect(mockError).toHaveBeenNthCalledWith(1, str, err, data1);
            expect(mockError).toHaveBeenNthCalledWith(2, str, err, data2);
        });

        it("outputs 2 histograms with observations", async () => {
            const key1 = "key1";
            const key2 = "key2";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.timing(key1, 5);
            prom.timing(key2, 25);
            prom.timing(key1, 7);
            prom.timing(key2, 27);
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key1 histogram");
            expect(dataSplit[1]).toBe('test_key1_bucket{le="10"} 2');
            expect(dataSplit[2]).toBe('test_key1_bucket{le="20"} 2');
            expect(dataSplit[3]).toBe('test_key1_bucket{le="+Inf"} 2');
            expect(dataSplit[4]).toBe("test_key1_sum 12");
            expect(dataSplit[5]).toBe("test_key1_count 2");
            // [6] empty line
            expect(dataSplit[7]).toBe("# TYPE test_key2 histogram");
            expect(dataSplit[8]).toBe('test_key2_bucket{le="10"} 0');
            expect(dataSplit[9]).toBe('test_key2_bucket{le="20"} 0');
            expect(dataSplit[10]).toBe('test_key2_bucket{le="+Inf"} 2');
            expect(dataSplit[11]).toBe("test_key2_sum 52");
            expect(dataSplit[12]).toBe("test_key2_count 2");
        });

        it("outputs a histogram with different label sets", async () => {
            const key = "key";
            const buckets: IConfiguredHistogramBuckets[] = [{ key, buckets: [20] }];
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port, buckets)));
            await prom.initialize(DefaultComponentContext);
            prom.timing(key, 10);
            prom.timing(key, 25, { label1: "val1" });
            prom.timing(key, 30, { label1: "val1", label2: "val2" });
            prom.timing(key, 1);
            prom.timing(key, 1, { label1: "val1" });
            prom.timing(key, 25, { label1: "val1", label2: "val2" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key histogram");
            expect(dataSplit[1]).toBe('test_key_bucket{le="20"} 2');
            expect(dataSplit[2]).toBe('test_key_bucket{le="+Inf"} 2');
            expect(dataSplit[3]).toBe("test_key_sum 11");
            expect(dataSplit[4]).toBe("test_key_count 2");
            expect(dataSplit[5]).toBe('test_key_bucket{le="20",label1="val1"} 1');
            expect(dataSplit[6]).toBe('test_key_bucket{le="+Inf",label1="val1"} 2');
            expect(dataSplit[7]).toBe('test_key_sum{label1="val1"} 26');
            expect(dataSplit[8]).toBe('test_key_count{label1="val1"} 2');
            expect(dataSplit[9]).toBe('test_key_bucket{le="20",label1="val1",label2="val2"} 0');
            expect(dataSplit[10]).toBe('test_key_bucket{le="+Inf",label1="val1",label2="val2"} 2');
            expect(dataSplit[11]).toBe('test_key_sum{label1="val1",label2="val2"} 55');
            expect(dataSplit[12]).toBe('test_key_count{label1="val1",label2="val2"} 2');
        });

        it("outputs a histogram with different values for the same labels", async () => {
            const key = "key";
            const port = nextPort();
            const prom = makeLifecycle(prometheus(prometheusConfiguration(port)));
            await prom.initialize(DefaultComponentContext);
            prom.timing(key, 10, { label1: "val1", label2: "val3" });
            prom.timing(key, 20, { label1: "val2", label2: "val2" });
            prom.timing(key, 30, { label1: "val3", label2: "val1" });
            const dataSplit = (await getMetrics(port)).split("\n");
            await prom.dispose();
            expect(dataSplit[0]).toBe("# TYPE test_key histogram");
            expect(dataSplit[1]).toBe('test_key_bucket{le="10",label1="val1",label2="val3"} 1');
            expect(dataSplit[2]).toBe('test_key_bucket{le="20",label1="val1",label2="val3"} 1');
            expect(dataSplit[3]).toBe('test_key_bucket{le="+Inf",label1="val1",label2="val3"} 1');
            expect(dataSplit[4]).toBe('test_key_sum{label1="val1",label2="val3"} 10');
            expect(dataSplit[5]).toBe('test_key_count{label1="val1",label2="val3"} 1');
            expect(dataSplit[6]).toBe('test_key_bucket{le="10",label1="val2",label2="val2"} 0');
            expect(dataSplit[7]).toBe('test_key_bucket{le="20",label1="val2",label2="val2"} 1');
            expect(dataSplit[8]).toBe('test_key_bucket{le="+Inf",label1="val2",label2="val2"} 1');
            expect(dataSplit[9]).toBe('test_key_sum{label1="val2",label2="val2"} 20');
            expect(dataSplit[10]).toBe('test_key_count{label1="val2",label2="val2"} 1');
            expect(dataSplit[11]).toBe('test_key_bucket{le="10",label1="val3",label2="val1"} 0');
            expect(dataSplit[12]).toBe('test_key_bucket{le="20",label1="val3",label2="val1"} 0');
            expect(dataSplit[13]).toBe('test_key_bucket{le="+Inf",label1="val3",label2="val1"} 1');
            expect(dataSplit[14]).toBe('test_key_sum{label1="val3",label2="val1"} 30');
            expect(dataSplit[15]).toBe('test_key_count{label1="val3",label2="val1"} 1');
        });
    });
});
