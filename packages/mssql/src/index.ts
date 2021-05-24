/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IOutputSink, IPublishedMessage } from "@walmartlabs/cookie-cutter-core";
import { MssqlSink } from "./MssqlSink";

export enum Mode {
    Table,
    StoredProcedure,
}

export interface IMssqlConfiguration {
    readonly server: string;
    readonly database: string;
    readonly username: string;
    readonly password: string;
    readonly encrypt: boolean;
    readonly mode?: Mode;
    readonly connectionTimeout?: number;
    readonly requestTimeout?: number;
}

@config.section
class MssqlConfiguration {
    @config.field(config.converters.string)
    public set server(_: string) {
        config.noop();
    }
    public get server(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set database(_: string) {
        config.noop();
    }
    public get database(): string {
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

    @config.field(config.converters.boolean)
    public set encrypt(_: boolean) {
        config.noop();
    }
    public get encrypt(): boolean {
        return config.noop();
    }

    @config.field(config.converters.enum(Mode))
    public set mode(_: Mode) {
        config.noop();
    }
    public get mode(): Mode {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set connectionTimeout(_: number) {
        config.noop();
    }
    public get connectionTimeout(): number {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set requestTimeout(_: number) {
        config.noop();
    }
    public get requestTimeout(): number {
        return config.noop();
    }
}

export function mssqlSink(configuration: IMssqlConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(MssqlConfiguration, configuration, {
        mode: Mode.Table,
        encrypt: false,
    });
    return new MssqlSink(configuration);
}
