/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder, IMessageTypeMapper } from "@walmartlabs/cookie-cutter-core";
import { IS3Configuration, IS3PublisherConfiguration } from ".";

@config.section
export class S3Configuration implements IS3Configuration {
    @config.field(config.converters.string)
    public set endpoint(_: string) {
        config.noop();
    }
    public get endpoint(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set accessKeyId(_: string) {
        config.noop();
    }
    public get accessKeyId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set secretAccessKey(_: string) {
        config.noop();
    }
    public get secretAccessKey(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set typeMapper(_: IMessageTypeMapper) {
        config.noop();
    }
    public get typeMapper(): IMessageTypeMapper {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set sslEnabled(_: boolean) {
        config.noop();
    }
    public get sslEnabled(): boolean {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set apiVersion(_: string) {
        config.noop();
    }
    public get apiVersion(): string {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set timeout(_: number) {
        config.noop();
    }
    public get timeout(): number {
        return config.noop();
    }
}

@config.section
export class S3PublisherConfiguration extends S3Configuration implements IS3PublisherConfiguration {
    @config.field(config.converters.string)
    public set defaultBucket(_: string) {
        config.noop();
    }
    public get defaultBucket(): string {
        return config.noop();
    }
}
