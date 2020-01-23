/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as http from "http";
import { IConfiguredHistogramBuckets, IPrometheusConfiguration } from "../config";
import { HttpServer } from "../HttpServer";

let testPort = 3002;
export const nextPort = () => testPort++;

export const port: number = 3001;
export const endpoint: string = "/metrics";
export const prometheusConfiguration = (
    port: number,
    buckets?: IConfiguredHistogramBuckets[]
): IPrometheusConfiguration => ({
    port,
    endpoint,
    prefix: "test_",
    defaultHistogramBuckets: [10, 20],
    configuredHistogramBuckets: buckets,
});

export function createServer(getMetrics: () => string): HttpServer {
    return HttpServer.create(port, endpoint, getMetrics);
}

export async function getMetrics(port: number) {
    return await new Promise<string>((resolve, reject) => {
        let data: string = "";
        http.get(`http://localhost:${port}${endpoint}`, (resp) => {
            resp.on("data", (chunk) => {
                data += chunk;
            });
            resp.on("end", () => {
                resolve(data);
            });
            resp.on("error", (err) => {
                reject(err);
            });
        });
    });
}

export async function destroyServer(server: HttpServer) {
    await server.close();
}
