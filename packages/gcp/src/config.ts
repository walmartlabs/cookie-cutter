/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config } from "@walmartlabs/cookie-cutter-core";
import { IBigQueryConfiguration, IGCSConfiguration } from ".";

@config.section
export class GCSConfiguration implements IGCSConfiguration {
    @config.field(config.converters.string)
    public set projectId(_: string) {
        config.noop();
    }
    public get projectId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set bucketId(_: string) {
        config.noop();
    }
    public get bucketId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientEmail(_: string) {
        config.noop();
    }
    public get clientEmail(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
}

@config.section
export class BigQueryConfiguration implements IBigQueryConfiguration {
    @config.field(config.converters.string)
    public set projectId(_: string) {
        config.noop();
    }
    public get projectId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set datasetId(_: string) {
        config.noop();
    }
    public get datasetId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set clientEmail(_: string) {
        config.noop();
    }
    public get clientEmail(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
}
