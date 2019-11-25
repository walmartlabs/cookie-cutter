/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger } from "@walmartlabs/cookie-cutter-core";
import { ClientOpts, RedisClient } from "redis";
import { promisify } from "util";

export enum RedisLogMessages {
    Connected = "Redis Connected",
    Error = "Redis Error",
    Ready = "Redis Ready",
    Reconnecting = "Redis Reconnecting",
    End = "Redis End",
}

export enum RedisEvents {
    Connected = "connected",
    Error = "error",
    Ready = "ready",
    Reconnecting = "reconnecting",
    End = "end",
}

export class RedisProxy {
    private client: RedisClient;
    private asyncGet: (key: string) => Promise<string>;
    private asyncSet: (key: string, value: string) => Promise<{}>;
    private asyncQuit: () => Promise<any>;
    constructor(host: string, port: number, db: number, logger: ILogger) {
        const opts: ClientOpts = {
            host,
            port,
            db,
        };
        this.client = new RedisClient(opts);
        this.client.on(RedisEvents.Connected, () => {
            logger.info(RedisLogMessages.Connected);
        });
        this.client.on(RedisEvents.Error, (err) => {
            logger.error(RedisLogMessages.Error, err);
        });
        this.client.on(RedisEvents.Ready, () => {
            logger.info(RedisLogMessages.Ready);
        });
        this.client.on(RedisEvents.Reconnecting, () => {
            logger.info(RedisLogMessages.Reconnecting);
        });
        this.client.on(RedisEvents.End, () => {
            logger.info(RedisLogMessages.End);
        });
        this.asyncGet = promisify(this.client.get).bind(this.client);
        this.asyncSet = promisify(this.client.set).bind(this.client) as any;
        this.asyncQuit = promisify(this.client.quit).bind(this.client);
    }

    public async dispose() {
        return this.asyncQuit();
    }

    public async set(key: string, value: Uint8Array) {
        // Base 64 encoding is used due to library constraints, and time constraints.
        // It should ultimately be updated to support direct set of byte arrays.
        const storableValue = Buffer.from(value).toString("base64");
        return await this.asyncSet(key, storableValue);
    }

    public async get(key: string): Promise<Uint8Array | undefined> {
        const val = await this.asyncGet(key);
        if (val) {
            return new Uint8Array(Buffer.from(val, "base64"));
        }
        return undefined;
    }
}
