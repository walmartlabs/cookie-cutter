/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ConsoleLogger, DefaultComponentContext } from "@walmartlabs/cookie-cutter-core";
import * as util from "util";
import { RedisEvents, RedisLogMessages, RedisProxy } from "../RedisProxy";
(util as any).promisify = jest.fn((fn) => fn);
const mockOn = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockQuit = jest.fn();
const mockXAdd = jest.fn();

jest.mock("redis", () => {
    const mockRedisClient = jest.fn(() => ({
        on: mockOn,
        get: mockGet,
        set: mockSet,
        quit: mockQuit,
        xadd: mockXAdd,
    }));
    return { RedisClient: mockRedisClient };
});
import { RedisClient } from "redis";

const mockClient: jest.Mock = RedisClient as any;

// Note that an integration test is far more important than this unit test,
// and should be created before this expands usage beyond a single service.
describe("Unit test the redis Proxy", () => {
    const ctx = { ...DefaultComponentContext, logger: new ConsoleLogger() };
    beforeEach(() => {
        mockClient.mockClear();
        mockOn.mockClear();
        mockGet.mockClear();
        mockSet.mockClear();
        mockQuit.mockClear();
        mockXAdd.mockClear();
    });

    it("Instantiates the client and registers all event handlers with logging", async () => {
        expect(1).toBe(1);
        const infoLogger = jest.fn();
        const errorLogger = jest.fn();
        const redisProxy = new RedisProxy("testHost", 0, 0);
        await redisProxy.initialize({
            ...ctx,
            logger: {
                info: infoLogger,
                error: errorLogger,
            } as any,
        });
        if (redisProxy) {
            // do nothing;
        }
        // Check that we instantiate the client
        expect(mockClient.mock.calls.length).toEqual(1);
        // Check that we add the correct number of listeners
        expect(mockOn.mock.calls.length).toEqual(5);
        // Check that we listen to all known events
        expect(mockOn.mock.calls[0][0]).toEqual(RedisEvents.Connected);
        expect(mockOn.mock.calls[1][0]).toEqual(RedisEvents.Error);
        expect(mockOn.mock.calls[2][0]).toEqual(RedisEvents.Ready);
        expect(mockOn.mock.calls[3][0]).toEqual(RedisEvents.Reconnecting);
        expect(mockOn.mock.calls[4][0]).toEqual(RedisEvents.End);
        // Test that all events are logged
        const testError = "testError";
        mockOn.mock.calls[0][1]();
        try {
            mockOn.mock.calls[1][1](testError);
        } catch (error) {
            expect(error).toContain(testError);
        }
        mockOn.mock.calls[2][1]();
        mockOn.mock.calls[3][1]();
        mockOn.mock.calls[4][1]();
        expect(infoLogger.mock.calls[0][0]).toEqual(RedisLogMessages.Connected);
        expect(infoLogger.mock.calls[1][0]).toEqual(RedisLogMessages.Ready);
        expect(infoLogger.mock.calls[2][0]).toEqual(RedisLogMessages.Reconnecting);
        expect(infoLogger.mock.calls[3][0]).toEqual(RedisLogMessages.End);

        expect(errorLogger.mock.calls[0][0]).toEqual(RedisLogMessages.Error);
        expect(errorLogger.mock.calls[0][1]).toEqual(testError);
    });

    it("Passes the key and value to the redis set function and converts the value to base64.", async () => {
        const redisProxy = new RedisProxy("testHost", 0, 0);
        await redisProxy.initialize(ctx);
        const key = "testKey";
        const value = new Uint8Array(Buffer.from("TestValue"));
        const base64Value = Buffer.from(value).toString("base64");
        await redisProxy.set(key, value);
        expect(mockSet.mock.calls.length).toEqual(1);
        expect(mockSet.mock.calls[0][0]).toEqual(key);
        expect(mockSet.mock.calls[0][1]).toEqual(base64Value);
    });

    it("Gets value by key and decodes from base64", async () => {
        const redisProxy = new RedisProxy("testHost", 0, 0);
        await redisProxy.initialize(ctx);
        const key = "testKey";
        const value = new Uint8Array(Buffer.from("TestValue"));
        const base64Value = Buffer.from(value).toString("base64");
        mockGet.mockImplementationOnce(() => base64Value);
        const retValue = await redisProxy.get(key);
        expect(mockGet.mock.calls.length).toEqual(1);
        expect(mockGet.mock.calls[0][0]).toEqual(key);
        expect(retValue).toEqual(value);
    });

    it("Returns undefined when no value is returned from the client", async () => {
        const redisProxy = new RedisProxy("testHost", 0, 0);
        await redisProxy.initialize(ctx);
        const key = "testKey";
        const retValue = await redisProxy.get(key);
        expect(mockGet.mock.calls.length).toEqual(1);
        expect(mockGet.mock.calls[0][0]).toEqual(key);
        expect(retValue).toBeUndefined();
    });

    it("Sends a quit command to the client", async () => {
        const redisProxy = new RedisProxy("testHost", 0, 0);
        await redisProxy.initialize(ctx);
        await redisProxy.dispose();
        expect(mockQuit.mock.calls.length).toEqual(1);
    });
});
