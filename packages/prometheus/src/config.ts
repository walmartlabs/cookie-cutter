import { config } from "@walmartlabs/cookie-cutter-core";

export interface IPrometheusConfiguration {
    /**
     * port where metrics are exposed (default 3000)
     *
     * @type {number}
     * @memberof IPrometheusConfiguration
     */
    readonly port: number;
    /**
     * endpoint where metrics are stored (default /metrics)
     *
     * @type {string}
     * @memberof IStatsdClientOptions
     */
    readonly endpoint: string;
    /**
     * prefix for time series
     *
     * @type {string}
     * @memberof IPrometheusConfiguration
     */
    readonly prefix: string;
}

@config.section
export class PrometheusConfiguration implements IPrometheusConfiguration {
    @config.field(config.converters.number)
    public set port(_: number) {
        config.noop();
    }
    public get port(): number {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set endpoint(_: string) {
        config.noop();
    }
    public get endpoint(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set prefix(_: string) {
        config.noop();
    }
    public get prefix(): string {
        return config.noop();
    }
}
