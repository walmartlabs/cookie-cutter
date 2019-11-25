/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    DefaultComponentContext,
    getRootProjectPackageInfo,
    IComponentContext,
    IDisposable,
    ILogger,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
} from "@walmartlabs/cookie-cutter-core";
import { StatsD } from "hot-shots";
import { isNumber } from "util";

export interface IStatsDConfiguration {
    /**
     * host is the host to send stats to.
     *
     * @type {string}
     * @memberof IStatsdClientOptions
     */
    readonly host: string;
    /**
     * prefix is the prefix to append to all stats with.
     *
     * @type {string}
     * @memberof IStatsdClientOptions
     */
    readonly prefix: string;
    /**
     * package is additional metadata to include for use as global tag values for metrics.
     * if not defined, this is derived from the package name and version in the root project's package.json.
     *
     * @type {{ name: string, version: string }}
     * @memberof IStatsDConfiguration
     */
    readonly package?: { name: string; version: string };
}

@config.section
class StatsDConfiguration implements IStatsDConfiguration {
    @config.field(config.converters.string)
    public set host(_: string) {
        config.noop();
    }
    public get host(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set prefix(_: string) {
        config.noop();
    }
    public get prefix(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set package(_: { name: string; version: string }) {
        config.noop();
    }
    public get package(): { name: string; version: string } {
        return config.noop();
    }
}

class StatsDMetrics implements IMetrics, IRequireInitialization, IDisposable {
    private client: StatsD | undefined;
    private logger: ILogger;

    constructor(private readonly config: IStatsDConfiguration) {
        this.logger = DefaultComponentContext.logger;
        this.client = undefined;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        const packageInfo = getRootProjectPackageInfo();
        let packageName = packageInfo.name;
        let packageVersion = packageInfo.version;
        if (this.config.package) {
            packageName = this.config.package.name;
            packageVersion = this.config.package.version;
        }
        const globalTags = {
            service: packageName,
            version: packageVersion,
        };
        this.client = new StatsD({
            telegraf: true,
            prefix: this.config.prefix,
            host: this.config.host,
            maxBufferSize: 1000, // string length size
            globalTags,
            errorHandler: (err?: Error) => {
                if (err) {
                    this.logger.error("StatsDMetrics: ", err);
                }
            },
        });
        this.logger.info("Stats Client Initialized", {
            prefix: this.config.prefix,
            influxDbMeasurements: {
                counter: this.config.prefix + "_counter",
                gauge: this.config.prefix + "_gauge",
                timing: this.config.prefix + "_timing",
            },
            globalTags,
        });
    }

    public increment(key: string, tags?: IMetricTags): void;
    public increment(key: string, value: number, tags?: IMetricTags): void;
    /**
     * increment adds 1 to a counter when no specific value is given.
     * Any positive or negative value can be passed in. Passing in a negative
     * value will subtract a value from the counter.
     *
     * @param {string} key
     * @param {*} [valueOrTags]
     * @param {IMetricTags} [tags]
     * @memberof StatsDMetrics
     */
    public increment(key: string, valueOrTags?: any, tags?: IMetricTags): void {
        let val = 1;
        if (valueOrTags !== undefined) {
            if (isNumber(valueOrTags)) {
                val = valueOrTags;
            } else {
                tags = valueOrTags;
            }
        }
        try {
            const t = {
                ...tags,
                metric_key: key,
            };
            if (this.client !== undefined) {
                this.client.increment(".counter", val, t, (err?: Error) => {
                    if (err) {
                        this.logger.error("StatsD increment error", err);
                    }
                });
            }
        } catch (e) {
            this.logger.error("StatsD increment error", e);
        }
    }

    public gauge(key: string, value: number, tags?: IMetricTags): void {
        try {
            const t = {
                ...tags,
                metric_key: key,
            };
            if (this.client !== undefined) {
                this.client.gauge(".gauge", value, t, (err?: Error) => {
                    if (err) {
                        this.logger.error("StatsD gauge error", err);
                    }
                });
            }
        } catch (e) {
            this.logger.error("StatsD gauge error", e);
        }
    }

    public timing(key: string, value: number, tags?: IMetricTags): void {
        try {
            const t = {
                ...tags,
                metric_key: key,
            };
            if (this.client !== undefined) {
                this.client.timing(".timing", value, t, (err?: Error) => {
                    if (err) {
                        this.logger.error("StatsD timing error", err);
                    }
                });
            }
        } catch (e) {
            this.logger.error("StatsD timing error", e);
        }
    }

    public async dispose(): Promise<void> {
        if (this.client) {
            await new Promise<void>((resolve, reject) => {
                // @ts-ignore
                this.client.close((err: Error | undefined) => {
                    if (err) {
                        this.logger.error(`Unable to close StatsdClient: ${err}`);
                        reject(err);
                    }
                    resolve();
                });
            });
        }
    }
}

export function statsd(configuration: IStatsDConfiguration): IMetrics {
    return new StatsDMetrics(config.parse(StatsDConfiguration, configuration));
}
