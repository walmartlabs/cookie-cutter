/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { QoS } from "mqtt";
import {
    IMqttAuthConfig,
    IMqttPreprocessor,
    IMqttPublisherConfiguration,
    IMqttSubscriberConfiguration,
} from ".";

@config.section
export class MQTTAuthConfig implements IMqttAuthConfig {
    @config.field(config.converters.string)
    public set hostName(_: string) {
        config.noop();
    }

    public get hostName(): string {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set hostPort(_: number) {
        config.noop();
    }

    public get hostPort(): number {
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
}

@config.section
export class MQTTPublisherConfiguration
    extends MQTTAuthConfig
    implements IMqttPublisherConfiguration
{
    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }

    public get encoder(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set defaultTopic(_: string) {
        config.noop();
    }

    public get defaultTopic(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set qos(_: QoS) {
        config.noop();
    }

    public get qos(): QoS {
        return config.noop();
    }
}

@config.section
export class MQTTSubscriberConfiguration
    extends MQTTAuthConfig
    implements IMqttSubscriberConfiguration
{
    @config.field(config.converters.none)
    public set preprocessor(_: IMqttPreprocessor) {
        config.noop();
    }

    public get preprocessor(): IMqttPreprocessor {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }

    public get encode(): IMessageEncoder {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set queueSize(_: number) {
        config.noop();
    }

    public get queueSize(): number {
        return config.noop();
    }

    @config.field(config.converters.listOf(config.converters.string))
    public set topic(_: string | string[]) {
        config.noop();
    }

    public get topic(): string | string[] {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set qos(_: QoS) {
        config.noop();
    }

    public get qos(): QoS {
        return config.noop();
    }
}
