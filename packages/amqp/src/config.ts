/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration, IAmqpQueueConfig, IAmqpMessageConfig, IAmqpServerConfig } from ".";

@config.section
export class AmqpServerConfig implements IAmqpServerConfig {
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

    @config.field(config.converters.string)
    public set username(_: string) {
        config.noop();
    }
    public get username(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set password(_: string) {
        config.noop();
    }
    public get password(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set vhost(_: string) {
        config.noop();
    }
    public get vhost(): string {
        return config.noop();
    }
}

@config.section
export class AmqpQueueConfig implements IAmqpQueueConfig {
    @config.field(config.converters.string)
    public set name(_: string) {
        config.noop();
    }
    public get name(): string {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set durable(_: boolean) {
        config.noop();
    }
    public get durable(): boolean {
        return config.noop();
    }
}

@config.section
export class AmqpMessageConfig implements IAmqpMessageConfig {
    @config.field(config.converters.timespan)
    public set expiration(_: number) {
        config.noop();
    }
    public get expiration(): number {
        return config.noop();
    }
}

@config.section
export class AmqpConfiguration implements IAmqpConfiguration {
    @config.field<IAmqpServerConfig>(AmqpServerConfig)
    public set server(_: IAmqpServerConfig) {
        config.noop();
    }
    public get server(): IAmqpServerConfig {
        return config.noop();
    }

    @config.field<IAmqpQueueConfig>(AmqpQueueConfig)
    public set queue(_: IAmqpQueueConfig) {
        config.noop();
    }
    public get queue(): IAmqpQueueConfig {
        return config.noop();
    }

    @config.field<IAmqpMessageConfig>(AmqpMessageConfig)
    public set message(_: IAmqpMessageConfig) {
        config.noop();
    }
    public get message(): IAmqpMessageConfig {
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
