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
import { RedisClient, Callback } from "redis";
import { promisify } from "util";

// [[streamName, [[id, [key, value, key, value ...]]]]]
export type RawReadGroupResult = [[string, [[string, string[]]]]];

export type RawXClaimResult = [[string, string[]]];

export type RawPELResult = [[string, string, number, number]];

interface IRedisCommandPatches {
    xadd: (key: string, id: string, ...args: (string | Buffer)[] | Callback<string>[]) => boolean;
    xreadgroup: (args: string[], cb: Callback<RawReadGroupResult>) => boolean;
    xgroup: (args: string[], cb: Callback<"OK">) => boolean;
    xack: (args: string[], cb: Callback<number>) => boolean;
    xpending: (args: string[], cb: Callback<RawPELResult>) => boolean;
    xclaim: (args: string[], cb: Callback<RawXClaimResult>) => boolean;
    set: (key: string, value: string | Buffer, cb: Callback<"OK">) => boolean;
}

export type RedisClientWithStreamOperations = RedisClient & IRedisCommandPatches;

export class RedisProxy implements IRequireInitialization, IDisposable {
    private readonly client: RedisClientWithStreamOperations;

    private logger: ILogger = DefaultComponentContext.logger;
    private asyncGet: (key: string) => Promise<string>;
    private asyncSet: (key: string, value: string | Buffer) => Promise<"OK">;
    private asyncQuit: () => Promise<any>;
    private asyncXAdd: (
        streamName: string,
        id: string,
        ...keyValues: (string | Buffer)[]
    ) => Promise<string>;
    private asyncXReadGroup: (args: string[]) => Promise<RawReadGroupResult>;
    private asyncXGroup: (args: string[]) => Promise<"OK">;
    private asyncXAck: (args: string[]) => Promise<number>;
    private asyncXPending: (args: string[]) => Promise<RawPELResult>;
    private asyncXClaim: (args: string[]) => Promise<RawXClaimResult>;

    constructor(host: string, port: number, db: number, password?: string) {
        // Redis ^2.8.0 includes all of the stream operations available on the the client.
        // However, @types/redis@2.8 does not currently include typings of the stream operations.
        // As proof, we can see redis@3.0.0 lists redis-commands@^1.5.0 as a dependency (https://www.runpkg.com/?redis@3.0.2/package.json)
        // If we then look at redis-commands@1.5.0, we can see the available commands (including all stream commands) in the commands.json file (https://www.runpkg.com/?redis-commands@1.5.0/commands.json)
        this.client = new RedisClient({
            host,
            port,
            db,
            password,
        }) as RedisClientWithStreamOperations;

        this.client.on("connected", () => {
            this.logger.debug("Connection to Redis established");
        });
        this.client.on("error", (err) => {
            this.logger.error("Redis Error", err);
            throw err;
        });
        this.client.on("ready", () => {
            this.logger.debug("Redis connection is ready");
        });
        this.client.on("reconnecting", () => {
            this.logger.debug("Reconnecting to Redis");
        });
        this.client.on("end", () => {
            this.logger.debug("Disconnected from Redis");
        });

        this.asyncGet = promisify(this.client.get).bind(this.client);
        this.asyncSet = promisify(this.client.set).bind(this.client);
        this.asyncXAdd = promisify(this.client.xadd).bind(this.client);
        this.asyncXReadGroup = promisify(this.client.xreadgroup).bind(this.client);
        this.asyncXGroup = promisify(this.client.xgroup).bind(this.client);
        this.asyncXAck = promisify(this.client.xack).bind(this.client);
        this.asyncXPending = promisify(this.client.xpending).bind(this.client);
        this.asyncXClaim = promisify(this.client.xclaim).bind(this.client);
        this.asyncQuit = promisify(this.client.quit).bind(this.client);
    }

    public async initialize(ctx: IComponentContext) {
        this.logger = ctx.logger;
    }

    public async dispose() {
        return this.asyncQuit();
    }

    public async set(key: string, value: string | Buffer) {
        return this.asyncSet(key, value);
    }

    public async get(key: string): Promise<string | undefined> {
        return this.asyncGet(key);
    }

    public async xadd(
        streamName: string,
        id: string,
        ...args: (string | Buffer)[]
    ): Promise<string> {
        return this.asyncXAdd(streamName, id, ...args);
    }

    public async xgroup(args: string[]): Promise<"OK"> {
        return this.asyncXGroup(args);
    }

    public async xack(streamName: string, consumerGroup: string, id: string): Promise<number> {
        return this.asyncXAck([streamName, consumerGroup, id]);
    }

    public async xreadgroup(args: string[]): Promise<RawReadGroupResult> {
        return this.asyncXReadGroup(args);
    }

    public async xpending(args: string[]): Promise<RawPELResult> {
        return this.asyncXPending(args);
    }

    public async xclaim(args: string[]): Promise<RawXClaimResult> {
        return this.asyncXClaim(args);
    }
}
