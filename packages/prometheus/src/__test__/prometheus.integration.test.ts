/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { DefaultComponentContext, makeLifecycle, sleep } from "@walmartlabs/cookie-cutter-core";
import * as fs from "fs";
import * as ip from "ip";
import * as path from "path";
import * as rp from "request-promise-native";
import { IPrometheusConfiguration } from "../config";
import { prometheus } from "../index";

// Sets up the file-based service discovery for Prometheus:
// Writes a targets.json file in the same directory that contains the prometheus.yml file
// The directory containing the 2 files is mounted as /etc/prometheus/ in the Docker image
const hostIp = ip.address();
const [port1, port2, port3] = [3001, 3002, 3003];
const jsonData = [
    {
        labels: { job: "tester" },
        targets: [`${hostIp}:${port1}`, `${hostIp}:${port2}`, `${hostIp}:${port3}`],
    },
];
fs.writeFileSync(
    path.resolve(__dirname, "..", "..", "config", "targets.json"),
    JSON.stringify(jsonData)
);

jest.setTimeout(60000);

interface IResponse {
    status: string;
    data: IData;
}
interface IData {
    resultType: string;
    result: IResult[];
}
interface IResult {
    metric: IMetric;
    value: [number, string];
}
interface IMetric {
    [key: string]: string;
}

const host = process.env.HOST_IP || ip.address();

async function queryPrometheus(key: string): Promise<IResponse> {
    const baseUrl = `http://${host}:9090/api/v1/query`;
    const reqOpt = { method: "GET", json: true };
    return await rp(`${baseUrl}?query=${key}`, reqOpt);
}

function basicExpects(resp: IResponse) {
    expect(resp.status).toEqual("success");
    expect(resp.data.resultType).toEqual("vector");
}

async function checkIfPromScraped(label: string): Promise<boolean> {
    const url = `http://${host}:9090/api/v1/label/${label}/values`;
    const reqOpt = { method: "GET", json: true };
    const maxAttempts = 20;
    let attempt = 1;
    while (attempt <= maxAttempts) {
        try {
            const resp: { status: string; data: string[] } = await rp(url, reqOpt);
            if (resp.status === "success" && resp.data.length > 0) {
                return true;
            }
        } catch (e) {
            if (attempt === maxAttempts) {
                throw e;
            }
        } finally {
            attempt++;
            await sleep(500);
        }
    }
    return false;
}

const prefix = "pre_";
const key1 = "key1";
const key2 = "key2";
const defaultConfig: IPrometheusConfiguration = { endpoint: "/metrics", prefix };

describe("Prometheus", () => {
    it("correctly queries Prometheus for several Counters", async () => {
        const cc = "c_";
        const prom = makeLifecycle(prometheus({ ...defaultConfig, port: port1 }));
        await prom.initialize(DefaultComponentContext);
        prom.increment(`${cc}${key1}`);
        prom.increment(`${cc}${key1}`, 11, { labelC1: "val1" });
        prom.increment(`${cc}${key1}`, 13, { labelC2: "val2", labelC3: "val3" });
        prom.increment(`${cc}${key1}`, { labelC1: "val1" });
        prom.increment(`${cc}${key1}`);
        prom.increment(`${cc}${key2}`, 0.1);
        prom.increment(`${cc}${key2}`, 0.1);
        await checkIfPromScraped("labelC1");
        try {
            let resp: IResponse;
            resp = await queryPrometheus(`${prefix}${cc}${key1}`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${cc}${key1}`,
                    }),
                    value: expect.arrayContaining([`${1 + 1}`]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${cc}${key1}`,
                        labelC1: "val1",
                    }),
                    value: expect.arrayContaining([`${11 + 1}`]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${cc}${key1}`,
                        labelC2: "val2",
                        labelC3: "val3",
                    }),
                    value: expect.arrayContaining([`${13}`]),
                },
            ]);
            resp = await queryPrometheus(`${prefix}${cc}${key2}`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${cc}${key2}`,
                    }),
                    value: expect.arrayContaining([`${0.1 + 0.1}`]),
                },
            ]);
        } catch (e) {
            throw e;
        } finally {
            await prom.dispose();
        }
    });

    it("correctly queries Prometheus for several Gauges", async () => {
        const gg = "g_";
        const prom = makeLifecycle(prometheus({ ...defaultConfig, port: port2 }));
        await prom.initialize(DefaultComponentContext);
        prom.gauge(`${gg}${key1}`, 0.1);
        prom.gauge(`${gg}${key2}`, 10);
        prom.gauge(`${gg}${key2}`, 15, { labelG1: "val1" });
        prom.gauge(`${gg}${key2}`, -15, { labelG1: "val1", labelG2: "val2" });
        await checkIfPromScraped("labelG1");
        try {
            let resp: IResponse;
            resp = await queryPrometheus(`${prefix}${gg}${key1}`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${gg}${key1}`,
                    }),
                    value: expect.arrayContaining(["0.1"]),
                },
            ]);
            resp = await queryPrometheus(`${prefix}${gg}${key2}`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${gg}${key2}`,
                    }),
                    value: expect.arrayContaining(["10"]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${gg}${key2}`,
                        labelG1: "val1",
                    }),
                    value: expect.arrayContaining(["15"]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${gg}${key2}`,
                        labelG1: "val1",
                        labelG2: "val2",
                    }),
                    value: expect.arrayContaining(["-15"]),
                },
            ]);
        } catch (e) {
            throw e;
        } finally {
            await prom.dispose();
        }
    });

    it("correctly queries Prometheus for several Histograms", async () => {
        const hh = "h_";
        const prom = makeLifecycle(
            prometheus({
                ...defaultConfig,
                defaultHistogramBuckets: [10, 20],
                configuredHistogramBuckets: [{ key: `${hh}${key2}`, buckets: [10] }],
                port: port3,
            })
        );
        await prom.initialize(DefaultComponentContext);
        prom.timing(`${hh}${key1}`, 5);
        prom.timing(`${hh}${key1}`, 15);
        prom.timing(`${hh}${key1}`, 21, { labelH1: "val1" });
        prom.timing(`${hh}${key1}`, 22, { labelH1: "val1" });
        prom.timing(`${hh}${key1}`, 1, { labelH1: "val1", labelH2: "val2" });
        prom.timing(`${hh}${key1}`, 2, { labelH1: "val1", labelH2: "val2" });
        await checkIfPromScraped("labelH1");
        try {
            let resp: IResponse;
            resp = await queryPrometheus(`${prefix}${hh}${key1}_sum`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_sum`,
                    }),
                    value: expect.arrayContaining([`${5 + 15}`]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_sum`,
                        labelH1: "val1",
                    }),
                    value: expect.arrayContaining([`${21 + 22}`]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_sum`,
                        labelH1: "val1",
                        labelH2: "val2",
                    }),
                    value: expect.arrayContaining([`${1 + 2}`]),
                },
            ]);
            resp = await queryPrometheus(`${prefix}${hh}${key1}_count`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject([
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_count`,
                    }),
                    value: expect.arrayContaining(["2"]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_count`,
                        labelH1: "val1",
                    }),
                    value: expect.arrayContaining(["2"]),
                },
                {
                    metric: expect.objectContaining({
                        __name__: `${prefix}${hh}${key1}_count`,
                        labelH1: "val1",
                        labelH2: "val2",
                    }),
                    value: expect.arrayContaining(["2"]),
                },
            ]);
            resp = await queryPrometheus(`${prefix}${hh}${key1}_bucket`);
            basicExpects(resp);
            expect(resp.data.result as IResult[]).toMatchObject(
                expect.arrayContaining([
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            le: "+Inf",
                        }),
                        value: expect.arrayContaining(["2"]),
                    },
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            le: "10",
                        }),
                        value: expect.arrayContaining(["1"]),
                    },
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            labelH1: "val1",
                            le: "+Inf",
                        }),
                        value: expect.arrayContaining(["2"]),
                    },
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            labelH1: "val1",
                            le: "10",
                        }),
                        value: expect.arrayContaining(["0"]),
                    },
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            labelH1: "val1",
                            labelH2: "val2",
                            le: "+Inf",
                        }),
                        value: expect.arrayContaining(["2"]),
                    },
                    {
                        metric: expect.objectContaining({
                            __name__: `${prefix}${hh}${key1}_bucket`,
                            labelH1: "val1",
                            labelH2: "val2",
                            le: "10",
                        }),
                        value: expect.arrayContaining(["2"]),
                    },
                ])
            );
        } catch (e) {
            throw e;
        } finally {
            await prom.dispose();
        }
    });
});
