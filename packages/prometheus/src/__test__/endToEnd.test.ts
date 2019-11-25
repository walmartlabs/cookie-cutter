import { DefaultComponentContext, makeLifecycle } from "@walmartlabs/cookie-cutter-core";
import { register } from "prom-client";
import { prometheus } from "../index";
import { getMetrics, prometheusConfiguration } from "./helper";

describe("Cookie Cutter", () => {
    beforeEach(() => {
        register.clear();
    });

    it("should return counters properly", async () => {
        const p = makeLifecycle(prometheus(prometheusConfiguration));
        await p.initialize(DefaultComponentContext);
        p.increment("theCounter");
        p.increment("theCounter", 44);
        const data = await getMetrics();
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theCounter prefix_theCounter");
        expect(dataSplit[1]).toBe("# TYPE prefix_theCounter counter");
        expect(dataSplit[2].startsWith("prefix_theCounter 45")).toBe(true);
    });

    it("should return gauges properly", async () => {
        const p = makeLifecycle(prometheus(prometheusConfiguration));
        await p.initialize(DefaultComponentContext);
        p.gauge("theGauge", 389);
        const data = await getMetrics();
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theGauge prefix_theGauge");
        expect(dataSplit[1]).toBe("# TYPE prefix_theGauge gauge");
        expect(dataSplit[2].startsWith("prefix_theGauge 389")).toBe(true);
    });

    it("should return timing properly", async () => {
        const p = makeLifecycle(prometheus(prometheusConfiguration));
        await p.initialize(DefaultComponentContext);
        p.timing("theTiming", 43829);
        p.timing("theTiming", 34);
        p.timing("theTiming", 1);
        p.timing("theTiming", 555);
        p.timing("theTiming", 3299);
        const data = await getMetrics();
        await p.dispose();
        const dataSplit = data.split("\n");
        expect(dataSplit[0]).toBe("# HELP prefix_theTiming prefix_theTiming");
        expect(dataSplit[1]).toBe("# TYPE prefix_theTiming summary");
        expect(dataSplit[2]).toBe('prefix_theTiming{quantile="0.5"} 555');
        expect(dataSplit[3]).toBe('prefix_theTiming{quantile="0.95"} 43829');
        expect(dataSplit[4]).toBe('prefix_theTiming{quantile="0.99"} 43829');
        expect(dataSplit[5]).toBe("prefix_theTiming_sum 47718");
        expect(dataSplit[6]).toBe("prefix_theTiming_count 5");

        expect(dataSplit[8]).toBe("# HELP prefix_theTiming_total prefix_theTiming_total");
        expect(dataSplit[9]).toBe("# TYPE prefix_theTiming_total counter");
        expect(dataSplit[10].startsWith("prefix_theTiming_total 47718")).toBe(true);

        expect(dataSplit[12]).toBe("# HELP prefix_theTiming_count prefix_theTiming_count");
        expect(dataSplit[13]).toBe("# TYPE prefix_theTiming_count counter");
        expect(dataSplit[14].startsWith("prefix_theTiming_count 5")).toBe(true);
    });
});
