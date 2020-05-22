/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IComponentRuntimeBehavior } from "@walmartlabs/cookie-cutter-core";
import {
    IGrpcClientConfiguration,
    IGrpcConfiguration,
    IGrpcServerConfiguration,
    IGrpcServiceDefinition,
} from "..";

@config.section
@config.extensible
export class GrpcConfiguration implements IGrpcConfiguration {
    @config.field(config.converters.bytes)
    public set maximumPayloadSize(_: number) {
        config.noop();
    }
    public get maximumPayloadSize(): number {
        return config.noop();
    }

    readonly [grpcConfigKey: string]: any;
}

@config.section
@config.extensible
export class GrpcSourceConfiguration extends GrpcConfiguration implements IGrpcServerConfiguration {
    @config.field(config.converters.number)
    public set port(_: number) {
        config.noop();
    }
    public get port(): number {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set host(_: string) {
        config.noop();
    }
    public get host(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set definitions(_: IGrpcServiceDefinition[]) {
        config.noop();
    }
    public get definitions(): IGrpcServiceDefinition[] {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set skipNoStreamingValidation(_: boolean) {
        config.noop();
    }
    public get skipNoStreamingValidation(): boolean {
        return config.noop();
    }
}

@config.section
@config.extensible
export class GrpcClientConfiguration extends GrpcConfiguration implements IGrpcClientConfiguration {
    @config.field(config.converters.string)
    public set endpoint(_: string) {
        config.noop();
    }
    public get endpoint(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set definition(_: IGrpcServiceDefinition) {
        config.noop();
    }
    public get definition(): IGrpcServiceDefinition {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set connectionTimeout(_: number) {
        config.noop();
    }
    public get connectionTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set requestTimeout(_: number) {
        config.noop();
    }
    public get requestTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set behavior(_: Required<IComponentRuntimeBehavior>) {
        config.noop();
    }
    public get behavior(): Required<IComponentRuntimeBehavior> {
        return config.noop();
    }
}
