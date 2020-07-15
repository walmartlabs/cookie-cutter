/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, getRootProjectPackageInfo, ITracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Tracer } from "opentracing";

import * as promClient from "prom-client";
import { PrometheusMetricsFactory, initTracer, TracingConfig, TracingOptions } from "jaeger-client";

export interface IJaegerConfiguration {
    /**
     * Endpoint to collect jaeger traces
     *
     * @type {string}
     * @memberof IJaegerConfiguration
     */
    readonly collectorEndpoint: string;

    /**
     * Namespace to be used for Prometheus metrics
     * if not defined, this is derived from the package name in the root project's package.json.
     *
     * @type {string}
     * @memberof IJaegerConfiguration
     */
    readonly metricNamespace?: string;

    /**
     * package is additional metadata to include for use by the jaeger agent.
     * if not defined, this is derived from the package name in the root project's package.json.
     *
     * @type {{ name: string }}
     * @memberof IJaegerConfiguration
     */
    readonly package?: { name: string };
}

@config.section
class JaegerConfiguration implements IJaegerConfiguration {
    @config.field(config.converters.string)
    public set collectorEndpoint(_: string) {
        config.noop();
    }
    public get collectorEndpoint(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set metricNamespace(_: string) {
        config.noop();
    }
    public get metricNamespace(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set package(_: { name: string }) {
        config.noop();
    }
    public get package(): { name: string } {
        return config.noop();
    }
}

class JaegerBuilder implements ITracerBuilder {
    public constructor(private configuration: Required<IJaegerConfiguration>) {}

    public create(): Tracer {
        const config: TracingConfig = {
            serviceName: this.configuration.package.name,
            reporter: {
                collectorEndpoint: this.configuration.collectorEndpoint,
            },
        };
        const options: TracingOptions = {
            metrics: new PrometheusMetricsFactory(
                promClient,
                this.configuration.metricNamespace || config.serviceName
            ),
        };
        return initTracer(config, options);
    }
}

export function jaegerTracer(
    configuration: IJaegerConfiguration,
    tracer: boolean = false
): ITracerBuilder | Tracer {
    const packageInfo = getRootProjectPackageInfo();
    const parsedConfig = config.parse(JaegerConfiguration, configuration, {
        package: { name: packageInfo.name },
    });
    if (tracer) {
        const config: TracingConfig = {
            serviceName: configuration.package.name,
            reporter: {
                collectorEndpoint: configuration.collectorEndpoint,
            },
        };
        const options: TracingOptions = {
            metrics: new PrometheusMetricsFactory(
                promClient,
                configuration.metricNamespace || config.serviceName
            ),
        };
        return initTracer(config, options);
    }

    return new JaegerBuilder(parsedConfig);
}
