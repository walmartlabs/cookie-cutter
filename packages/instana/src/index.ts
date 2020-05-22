/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, getRootProjectPackageInfo, ITracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Tracer } from "opentracing";

export enum LogLevel {
    Debug = "debug",
    Info = "info",
    Warn = "warn",
    Error = "error",
}

export interface IInstanaConfiguration {
    /**
     * host is the instana agent host address.
     *
     * @type {string}
     * @memberof IInstanaConfiguration
     */
    readonly host: string;
    /**
     * package is additional metadata to include for use by the global instana agent.
     * if not defined, this is derived from the package name in the root project's package.json.
     *
     * @type {{ name: string }}
     * @memberof IInstanaConfiguration
     */
    readonly package?: { name: string };
    /**
     * log level for the instana client
     *
     * @type {string}
     * @memberof IInstanaConfiguration
     */

    readonly logLevel?: LogLevel;
}

@config.section
class InstanaConfiguration implements IInstanaConfiguration {
    @config.field(config.converters.string)
    public set host(_: string) {
        config.noop();
    }
    public get host(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set package(_: { name: string }) {
        config.noop();
    }
    public get package(): { name: string } {
        return config.noop();
    }

    @config.field(config.converters.enum(LogLevel))
    public set logLevel(_: LogLevel) {
        config.noop();
    }
    public get logLevel(): LogLevel {
        return config.noop();
    }
}

class InstanaBuilder implements ITracerBuilder {
    public constructor(private configuration: Required<IInstanaConfiguration>) {}

    public create(): Tracer {
        const instana = require("@instana/collector");

        instana({
            tracing: {
                disableAutomaticTracing: true,
            },
            serviceName: this.configuration.package.name,
            reportUncaughtException: true,
            agentHost: this.configuration.host,
            level: this.configuration.logLevel,
            // TODO - update our logger to work with Instana
            // it currently doesn't format messages from Instana correctly
        });
        return instana.opentracing.createTracer();
    }
}

export function instanaTracer(
    configuration: IInstanaConfiguration,
    tracer: boolean = false
): ITracerBuilder | Tracer {
    const packageInfo = getRootProjectPackageInfo();
    const parsedConfig = config.parse(InstanaConfiguration, configuration, {
        package: { name: packageInfo.name },
        logLevel: LogLevel.Info,
    });
    if (tracer) {
        const instana = require("@instana/collector");

        instana({
            tracing: {
                disableAutomaticTracing: true,
            },
            serviceName: parsedConfig.package.name,
            reportUncaughtException: true,
            agentHost: parsedConfig.host,
            level: parsedConfig.logLevel,
            // TODO - update our logger to work with Instana
            // it currently doesn't format messages from Instana correctly
        });
        return instana.opentracing.createTracer();
    }

    return new InstanaBuilder(parsedConfig);
}
