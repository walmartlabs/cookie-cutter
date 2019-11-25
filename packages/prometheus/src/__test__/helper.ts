import * as http from "http";
import { IPrometheusConfiguration } from "../config";
import { HttpServer } from "../HttpServer";

export const port: number = 3000;
export const endpoint: string = "/metrics";
export const prometheusConfiguration: IPrometheusConfiguration = {
    port,
    endpoint,
    prefix: "prefix_",
};

export function createServer(getMetrics: () => string): HttpServer {
    return HttpServer.create(port, endpoint, getMetrics);
}

export async function getMetrics() {
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
