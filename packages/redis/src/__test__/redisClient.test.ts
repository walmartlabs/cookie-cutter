/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IComponentContext,
    NullMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import * as util from "util";
import { IRedisOptions } from "..";
import { RedisClient as CCRedisClient } from "../RedisClient";
(util as any).promisify = jest.fn((fn) => fn);
const mockOn = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockQuit = jest.fn();
const mockXAdd = jest.fn();
const mockXRead = jest.fn();
const mockXReadGroup = jest.fn();
const mockXGroup = jest.fn();
const mockXAck = jest.fn();
const mockXPending = jest.fn();

jest.mock("redis", () => {
    const mockRedisClient = jest.fn(() => ({
        on: mockOn,
        get: mockGet,
        set: mockSet,
        quit: mockQuit,
        xadd: mockXAdd,
        xread: mockXRead,
        xreadgroup: mockXReadGroup,
        xgroup: mockXGroup,
        xack: mockXAck,
        xpending: mockXPending,
    }));
    return { RedisClient: mockRedisClient };
});
import { RedisClient } from "redis";
const mockClient: jest.Mock = RedisClient as any;

// Note that an integration test is far more important than this unit test,
// and should be created before this expands usage beyond a single service.
describe("Unit test the redis client", () => {
    const encoder = {
        mimeType: "testMimeType",
        decode: (v: any) => v,
        encode: (v: any) => new Uint8Array(Buffer.from(v.payload)),
    };
    const config: IRedisOptions = {
        host: "testHost",
        port: 0,
        db: 0,
        encoder: new NullMessageEncoder(),
        typeMapper: {
            map: (v: any) => v,
        },
        base64Encode: true,
    };

    beforeEach(() => {
        mockClient.mockClear();
        mockOn.mockClear();
        mockGet.mockClear();
        mockSet.mockClear();
        mockQuit.mockClear();
        mockXAdd.mockClear();
    });

    it("Instantiates the client", async () => {
        expect(1).toBe(1);
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient(config);
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        // Check that we instantiate the client
        expect(mockClient.mock.calls.length).toEqual(1);
    });

    it("Disposes of underlying client", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient(config);
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        await redisClient.dispose();
        expect(mockQuit.mock.calls.length).toEqual(1);
    });

    it("Puts obj into storage successfully", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({ ...config, encoder });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const value = "testValue";
        const type = "testType";
        await redisClient.putObject(span, type, value, key);
        expect(mockSet.mock.calls.length).toEqual(1);
    });

    it("Fails to put object in storage", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({
            ...config,
            encoder,
            typeMapper: {
                map: (v: any) => v.val,
            },
        });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const value = "testValue";
        const type = { val: "testType" };
        const testError = "testError";
        mockSet.mockImplementation(async () => {
            throw new Error(testError);
        });
        await expect(redisClient.putObject(span, type as any, value, key)).rejects.toThrow(
            testError
        );
    });

    it("Fails during retrieval", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({
            ...config,
            encoder,
            typeMapper: {
                map: (v: any) => v.val,
            },
        });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const type = { val: "testType" };
        const testError = "testError";
        mockGet.mockImplementation(async () => {
            throw new Error(testError);
        });
        await expect(redisClient.getObject(span, type as any, key)).rejects.toThrow(testError);
    });

    it("Gets obj from storage successfully", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({
            ...config,
            encoder: {
                mimeType: "testType",
                decode: (v: any) => ({ type: "test", payload: v }),
                encode: (v: any) => new Uint8Array(Buffer.from(v.payload)),
            },
        });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const value = new Uint8Array(Buffer.from("TestValue"));
        const base64Value = Buffer.from(value).toString("base64");
        const type = "testType";
        mockGet.mockImplementation(() => base64Value);
        const getVal = await redisClient.getObject(span, type, key);
        expect(mockGet.mock.calls.length).toEqual(1);
        expect(getVal).toEqual(value);
    });

    it("xadds an object into a stream succesfully", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({ ...config, encoder });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const value = "testValue";
        const type = "testType";

        await redisClient.xAddObject(span, type, "test-stream", key, value);

        expect(mockXAdd.mock.calls.length).toEqual(1);
    });

    it("xadds fails to an object into a stream succesfully", async () => {
        const infoLogger = jest.fn();
        const redisClient = new CCRedisClient({ ...config, encoder });
        const ctx: IComponentContext = {
            ...DefaultComponentContext,
            logger: { info: infoLogger } as any,
        };
        await redisClient.initialize(ctx);
        const span = new SpanContext();
        const key = "testKey";
        const value = "testValue";
        const type = "testType";
        const testError = new Error("test error");

        mockXAdd.mockImplementation(async () => {
            throw testError;
        });

        await expect(redisClient.xAddObject(span, type, "test-stream", key, value)).rejects.toThrow(
            testError
        );
    });
});
