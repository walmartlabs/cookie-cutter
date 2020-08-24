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
    public set stream(_: string) {
        config.noop();
    }
    public get stream(): string {
        return config.noop();
    }

    @config.field(config.converters.listOf(config.converters.string))
    public set streams(_: string[]) {
        config.noop();
    }
    public get streams(): string[] {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set consumerGroup(_: string) {
        config.noop();
    }
    public get consumerGroup(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set consumerId(_: string) {
        config.noop();
    }
    public get consumerId(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set consumerGroupStartId(_: string) {
        config.noop();
    }
    public get consumerGroupStartId(): string {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set blockTimeout(_: number) {
        config.noop();
    }
    public get blockTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set idleTimeout(_: number) {
        config.noop();
    }
    public get idleTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.timespan)
    public set reclaimMessageInterval(_: number) {
        config.noop();
    }
    public get reclaimMessageInterval(): number {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set batchSize(_: number) {
        config.noop();
    }
    public get batchSize(): number {
        return config.noop();
    }

    @config.field(config.converters.boolean)
    public set base64Encode(_: boolean) {
        config.noop();
    }

    public get base64Encode(): boolean {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set password(_: string) {
        config.noop();
    }

    public get password(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set payloadKey(_: string) {
        config.noop();
    }

    public get payloadKey(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set typeNameKey(_: string) {
        config.noop();
    }

    public get typeNameKey(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set maxStreamLength(_: number) {
        config.noop();
    }

    public get maxStreamLength(): number {
        return config.noop();
    }
}
