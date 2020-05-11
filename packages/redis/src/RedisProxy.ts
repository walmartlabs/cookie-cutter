/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IComponentContext,
    IDisposable,
    ILogger,
    IRequireInitialization,
} from "@walmartlabs/cookie-cutter-core";
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

interface IRedisStreamOperations {
    xadd: (key: string, id: string, ...args: string[]) => Promise<string>;
}

export type RedisClientWithStreamOperations = RedisClient & IRedisStreamOperations;

export class RedisProxy implements IRequireInitialization, IDisposable {
    private client: RedisClientWithStreamOperations;
    private logger: ILogger;
    private asyncGet: (key: string) => Promise<string>;
    private asyncSet: (key: string, value: string) => Promise<{}>;
    private asyncQuit: () => Promise<any>;
    private asyncXAdd: (streamName: string, id: string, ...keyValues: string[]) => Promise<string>;
    constructor(host: string, port: number, db: number) {
        this.logger = DefaultComponentContext.logger;
        const opts: ClientOpts = {
            host,
            port,
            db,
        };
        // Redis ^2.8.0 includes all of the stream operations available on the the client.
        // However, @types/redis@^2.8.13 does not currently include typings of the stream operations.
        // As proof, we can see redis@2.8.0 lists redis-commands@^1.2.0 as a dependency (https://www.runpkg.com/?redis@2.8.0/package.json)
        // If we then look at redis-commands@1.2.0, we can see the available commands (including all stream commands) in the commands.json file (https://www.runpkg.com/?redis-commands@1.5.0/commands.json)
        this.client = new RedisClient(opts) as RedisClientWithStreamOperations;
        this.client.on(RedisEvents.Connected, () => {
            this.logger.info(RedisLogMessages.Connected);
        });
        this.client.on(RedisEvents.Error, (err) => {
            this.logger.error(RedisLogMessages.Error, err);
            throw err;
        });
        this.client.on(RedisEvents.Ready, () => {
            this.logger.info(RedisLogMessages.Ready);
        });
        this.client.on(RedisEvents.Reconnecting, () => {
            this.logger.info(RedisLogMessages.Reconnecting);
        });
        this.client.on(RedisEvents.End, () => {
            this.logger.info(RedisLogMessages.End);
        });
        this.asyncGet = promisify(this.client.get).bind(this.client);
        this.asyncSet = promisify(this.client.set).bind(this.client) as any;
        this.asyncXAdd = promisify(this.client.xadd).bind(this.client);
        this.asyncQuit = promisify(this.client.quit).bind(this.client);
    }

    public async initialize(ctx: IComponentContext) {
        this.logger = ctx.logger;
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

    public async xadd(streamName: string, id: string, ...args: string[]): Promise<string> {
        return this.asyncXAdd(streamName, id, ...args);
    }
}
