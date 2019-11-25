/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, getRootProjectPackageInfo, ITracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Tracer } from "opentracing";

export enum LogLevel {
    None = 0, // the client library will never log to the console
    ThrottleErrors = 1, // error reporting will be throttled to the first error per minute
    AllErrors = 2, // all errors are logged to the console
    Verbose = 3, // all errors, warnings, and info statements are logged to the console
    AllLogs = 4, // all log statements, including debugging details
}

export interface ILightStepConfiguration {
    /**
     * host is the lightstep agent host address.
     *
     * @type {string}
     * @memberof ILightstepConfiguration
     */
    readonly host: string;
    /**
     * port is the lightstep agent port.
     *
     * @type {string}
     * @memberof ILightstepConfiguration
     */
    readonly port: number;
    /**
     * package is additional metadata to include for use by the global lightstep agent.
     * if not defined, this is derived from the package name in the root project's package.json.
     *
     * @type {{ name: string }}
     * @memberof ILightstepConfiguration
     */
    readonly package?: { name: string };
    /**
     * log level for the lightstep client
     *
     * @type {string}
     * @memberof ILightstepConfiguration
     */

    readonly logLevel?: LogLevel;
    /**
     * encryption method to use when sending trace data
     *
     * @type {string}
     * @memberof ILightstepConfiguration
     */

    readonly encryption?: string;
    /**
     * accessToken to use for the lightstep client
     *
     * @type {string}
     * @memberof ILightstepConfiguration
     */

    readonly accessToken?: string;
}

@config.section
class LightStepConfiguration implements ILightStepConfiguration {
    @config.field(config.converters.string)
    public set host(_: string) {
        config.noop();
    }
    public get host(): string {
        return config.noop();
    }
    @config.field(config.converters.number)
    public set port(_: number) {
        config.noop();
    }
    public get port(): number {
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
    @config.field(config.converters.string)
    public set encryption(_: string) {
        config.noop();
    }
    public get encryption(): string {
        return config.noop();
    }
    @config.field(config.converters.string)
    public set accessToken(_: string) {
        config.noop();
    }
    public get accessToken(): string {
        return config.noop();
    }
}

class LightStepBuilder implements ITracerBuilder {
    public constructor(private configuration: Required<ILightStepConfiguration>) {}

    public create(): Tracer {
        const lightstep = require("lightstep-tracer");

        const tracer = new lightstep.Tracer({
            component_name: this.configuration.package.name,
            collector_host: this.configuration.host,
            collector_port: this.configuration.port,
            collector_encryption: this.configuration.encryption,
            access_token: this.configuration.accessToken,
        });
        return tracer;
    }
}

export function lightstepTracer(configuration: ILightStepConfiguration): ITracerBuilder {
    const packageInfo = getRootProjectPackageInfo();
    const parsedConfig = config.parse(LightStepConfiguration, configuration, {
        host: "localhost",
        port: 8360,
        package: { name: packageInfo.name },
        logLevel: LogLevel.ThrottleErrors,
    });
    return new LightStepBuilder(parsedConfig);
}
