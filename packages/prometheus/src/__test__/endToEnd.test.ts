/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { DefaultComponentContext, makeLifecycle } from "@walmartlabs/cookie-cutter-core";
import { register } from "prom-client";
import { prometheus } from "../index";
import { getMetrics, nextPort, prometheusConfiguration } from "./helper";

describe("Cookie Cutter", () => {
    beforeEach(() => {
        register.clear();
    });

    it("should return counters properly", async () => {
        const port = nextPort();
        const config = prometheusConfiguration(port);
        const p = makeLifecycle(prometheus(config));
        await p.initialize(DefaultComponentContext);
        p.increment("theCounter");
        p.increment("theCounter", 44);
        const data = await getMetrics(port);
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theCounter prefix_theCounter");
        expect(dataSplit[1]).toBe("# TYPE prefix_theCounter counter");
        expect(dataSplit[2].startsWith("prefix_theCounter 45")).toBe(true);
    });

    it("should return gauges properly", async () => {
        const port = nextPort();
        const config = prometheusConfiguration(port);
        const p = makeLifecycle(prometheus(config));
        await p.initialize(DefaultComponentContext);
        p.gauge("theGauge", 389);
        const data = await getMetrics(port);
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theGauge prefix_theGauge");
        expect(dataSplit[1]).toBe("# TYPE prefix_theGauge gauge");
        expect(dataSplit[2].startsWith("prefix_theGauge 389")).toBe(true);
    });

    it("should return timing properly", async () => {
        const port = nextPort();
        const config = prometheusConfiguration(port);
        const p = makeLifecycle(prometheus({ ...config, histogramBuckets: [30, 10000] }));
        await p.initialize(DefaultComponentContext);
        p.timing("theTiming", 43829);
        p.timing("theTiming", 34);
        p.timing("theTiming", 1);
        p.timing("theTiming", 555);
        p.timing("theTiming", 3299);
        const data = await getMetrics(port);
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theTiming prefix_theTiming");
        expect(dataSplit[1]).toBe("# TYPE prefix_theTiming histogram");
        expect(dataSplit[2]).toBe('prefix_theTiming_bucket{le="30"} 1');
        expect(dataSplit[3]).toBe('prefix_theTiming_bucket{le="10000"} 4');
        expect(dataSplit[4]).toBe('prefix_theTiming_bucket{le="+Inf"} 5');
        expect(dataSplit[5]).toBe("prefix_theTiming_sum 47718");
        expect(dataSplit[6]).toBe("prefix_theTiming_count 5");
    });
});
