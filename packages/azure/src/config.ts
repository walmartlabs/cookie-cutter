/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { IBlobStorageConfiguration, ICosmosConfiguration } from ".";

@config.section
export class CosmosConfiguration implements ICosmosConfiguration {
    @config.field(config.converters.string)
    public set url(_: string) {
        config.noop();
    }
    public get url(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set key(_: string) {
        config.noop();
    }
    public get key(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set databaseId(_: string) {
        config.noop();
    }
    public get databaseId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set collectionId(_: string) {
        config.noop();
    }
    public get collectionId(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }
}

@config.section
export class BlobStorageConfiguration implements IBlobStorageConfiguration {
    @config.field(config.converters.string)
    public set storageAccount(_: string) {
        config.noop();
    }
    public get storageAccount(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set storageAccessKey(_: string) {
        config.noop();
    }
    public get storageAccessKey(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set container(_: string) {
        config.noop();
    }
    public get container(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set url(_: string) {
        config.noop();
    }
    public get url(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set connectionString(_: string) {
        config.noop();
    }
    public get connectionString(): string {
        return config.noop();
    }
}
