/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    JsonMessageEncoder,
    ObjectNameMessageTypeMapper,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import { IRedisClient, IRedisOptions, redisClient } from "@walmartlabs/cookie-cutter-redis";

class ReadValue {
    constructor(public key: string) {}
}

class WriteValue {
    constructor(public key: string, public contents: string) {}
}

const conf: IRedisOptions = {
    host: "localhost",
    port: 6379,
    db: 0,
    encoder: new JsonMessageEncoder(),
    typeMapper: new ObjectNameMessageTypeMapper(),
};
const redisServiceName = "redis";

Application.create()
    .logger(new ConsoleLogger())
    .input()
    .add(
        new StaticInputSource([
            { type: WriteValue.name, payload: new WriteValue("key1", "contents 1") },
            { type: WriteValue.name, payload: new WriteValue("key2", "contents 2") },
            { type: ReadValue.name, payload: new ReadValue("key1") },
            { type: ReadValue.name, payload: new ReadValue("key2") },
        ])
    )
    .done()
    .services()
    .add(redisServiceName, redisClient(conf))
    .done()
    .dispatch({
        onWriteValue: async (msg: WriteValue, ctx: IDispatchContext): Promise<void> => {
            const redisService = ctx.services.get<IRedisClient>(redisServiceName);
            await redisService.putObject(ctx.trace.context, WriteValue, msg, msg.key);
            ctx.logger.info("onWriteValue", { key: msg.key, contents: msg.contents });
        },
        onReadValue: async (msg: ReadValue, ctx: IDispatchContext): Promise<void> => {
            const redisService = ctx.services.get<IRedisClient>(redisServiceName);
            const res = await redisService.getObject(ctx.trace.context, WriteValue, msg.key);
            ctx.logger.info("onReadValue", { key: res.key, contents: res.contents });
        },
    })
    .run();
