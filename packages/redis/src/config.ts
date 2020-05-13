/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder, IMessageTypeMapper } from "@walmartlabs/cookie-cutter-core";
import { IRedisOptions } from ".";

@config.section
export class RedisOptions implements IRedisOptions {
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

    @config.field(config.converters.number)
    public set db(_: number) {
        config.noop();
    }
    public get db(): number {
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

    @config.field(config.converters.string)
    public set writeStream(_: string) {
        config.noop();
    }
    public get writeStream(): string {
        return config.noop();
    }

    @config.field(config.converters.listOf(config.converters.string))
    public set readStream(_: string[]) {
        config.noop();
    }
    public get readStream(): string[] {
        return config.noop();
    }
}
