/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    JsonMessageEncoder,
    NullLogger,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { ICosmosQuery, ICosmosQueryClient } from "../../..";
import { ISnapshotProvider } from "../../../event-sourced";
import {
    CosmosStateAggregationSource,
    NullSnapshotProvider,
} from "../../../event-sourced/internal";

describe("CosmosStateAggregationSource", () => {
    interface ITestSetup {
        readonly source: CosmosStateAggregationSource<any>;
        readonly logSpy: jest.SpyInstance<void, []>;
        readonly querySpy: jest.SpyInstance<Promise<any[]>, [SpanContext, ICosmosQuery, string?]>;
        readonly snapshotSpy: jest.SpyInstance<
            Promise<[number, any]>,
            [SpanContext, string, number?]
        >;
    }

    async function createSource(queryResult: any[], snapshot?: [number, any]): Promise<ITestSetup> {
        const logger = new NullLogger();
        const cosmosClient: ICosmosQueryClient = {
            query: () => Promise.resolve(queryResult),
        };
        const snapshotProvider: ISnapshotProvider<any> =
            snapshot === undefined
                ? new NullSnapshotProvider()
                : { get: () => Promise.resolve(snapshot) };

        const source = new CosmosStateAggregationSource(
            cosmosClient,
            new JsonMessageEncoder(),
            snapshotProvider
        );

        await source.initialize({
            ...DefaultComponentContext,
            logger,
        });

        return {
            source,
            logSpy: jest.spyOn(logger, "warn"),
            querySpy: jest.spyOn(cosmosClient, "query"),
            snapshotSpy: jest.spyOn(snapshotProvider, "get"),
        };
    }

    describe("Healthy Streams", () => {
        it("reads entire stream", async () => {
            const { source, querySpy, snapshotSpy } = await createSource([
                { sn: 1, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 2, event_type: "test", encodedData: { data: Buffer.from("test") } },
            ]);

            const actual = await source.load(undefined, "key-1");
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", undefined);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT [^TOP]/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 1 },
                    { name: "@max", value: undefined },
                ],
            });
            expect(actual.lastSn).toBe(2);
            expect(actual.events.length).toBe(2);
            expect(actual.snapshot).toBeUndefined();
        });

        it("reads snapshot plus missing events", async () => {
            const { source, querySpy, snapshotSpy } = await createSource(
                [
                    { sn: 3, event_type: "test", encodedData: { data: Buffer.from("test") } },
                    { sn: 4, event_type: "test", encodedData: { data: Buffer.from("test") } },
                ],
                [2, { foo: "bar" }]
            );

            const actual = await source.load(undefined, "key-1");
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", undefined);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT [^TOP]/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 3 },
                    { name: "@max", value: undefined },
                ],
            });
            expect(actual.lastSn).toBe(4);
            expect(actual.events.length).toBe(2);
            expect(actual.snapshot).toMatchObject({ foo: "bar" });
        });

        it("reads stream without snapshot till atSn", async () => {
            const { source, querySpy, snapshotSpy } = await createSource([
                { sn: 1, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 2, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 3, event_type: "test", encodedData: { data: Buffer.from("test") } },
            ]);

            const actual = await source.load(undefined, "key-1", 3);
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", 3);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT TOP/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 1 },
                    { name: "@max", value: 3 },
                ],
            });
            expect(actual.lastSn).toBe(3);
            expect(actual.events.length).toBe(3);
            expect(actual.snapshot).toBeUndefined();
        });

        it("reads stream with snapshot till atSn", async () => {
            const { source, querySpy, snapshotSpy } = await createSource(
                [{ sn: 3, event_type: "test", encodedData: { data: Buffer.from("test") } }],
                [2, { foo: "bar" }]
            );

            const actual = await source.load(undefined, "key-1", 3);
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", 3);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT TOP/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 3 },
                    { name: "@max", value: 1 },
                ],
            });
            expect(actual.lastSn).toBe(3);
            expect(actual.events.length).toBe(1);
            expect(actual.snapshot).toMatchObject({ foo: "bar" });
        });

        it("ignores snapshot newer than atSn", async () => {
            const { source, querySpy, snapshotSpy } = await createSource(
                [
                    { sn: 1, event_type: "test", encodedData: { data: Buffer.from("test") } },
                    { sn: 2, event_type: "test", encodedData: { data: Buffer.from("test") } },
                    { sn: 3, event_type: "test", encodedData: { data: Buffer.from("test") } },
                ],
                [5, { foo: "bar" }]
            );

            const actual = await source.load(undefined, "key-1", 3);
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", 3);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT TOP/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 1 },
                    { name: "@max", value: 3 },
                ],
            });
            expect(actual.lastSn).toBe(3);
            expect(actual.events.length).toBe(3);
            expect(actual.snapshot).toBeUndefined();
        });
    });

    describe("Broken Streams", () => {
        it("reads entire stream", async () => {
            const { source, querySpy, snapshotSpy, logSpy } = await createSource([
                { sn: 1, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 3, event_type: "test", encodedData: { data: Buffer.from("test") } },
            ]);

            const actual = await source.load(undefined, "key-1");
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", undefined);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT [^TOP]/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 1 },
                    { name: "@max", value: undefined },
                ],
            });
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(actual.lastSn).toBe(3);
            expect(actual.events.length).toBe(2);
            expect(actual.snapshot).toBeUndefined();
        });

        it("reads snapshot plus missing events", async () => {
            const { source, querySpy, snapshotSpy, logSpy } = await createSource(
                [
                    { sn: 4, event_type: "test", encodedData: { data: Buffer.from("test") } },
                    { sn: 5, event_type: "test", encodedData: { data: Buffer.from("test") } },
                ],
                [2, { foo: "bar" }]
            );

            const actual = await source.load(undefined, "key-1");
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", undefined);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT [^TOP]/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 3 },
                    { name: "@max", value: undefined },
                ],
            });
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(actual.lastSn).toBe(5);
            expect(actual.events.length).toBe(2);
            expect(actual.snapshot).toMatchObject({ foo: "bar" });
        });

        it("reads stream without snapshot till atSn", async () => {
            const { source, querySpy, snapshotSpy, logSpy } = await createSource([
                { sn: 1, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 2, event_type: "test", encodedData: { data: Buffer.from("test") } },
                { sn: 4, event_type: "test", encodedData: { data: Buffer.from("test") } },
            ]);

            const actual = await source.load(undefined, "key-1", 3);
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", 3);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT TOP/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 1 },
                    { name: "@max", value: 3 },
                ],
            });
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(actual.lastSn).toBe(2);
            expect(actual.events.length).toBe(2);
            expect(actual.snapshot).toBeUndefined();
        });

        it("reads stream with snapshot till atSn", async () => {
            const { source, querySpy, snapshotSpy, logSpy } = await createSource(
                [{ sn: 4, event_type: "test", encodedData: { data: Buffer.from("test") } }],
                [2, { foo: "bar" }]
            );

            const actual = await source.load(undefined, "key-1", 3);
            expect(snapshotSpy).toHaveBeenCalledWith(undefined, "key-1", 3);
            expect(querySpy).toHaveBeenCalledWith(undefined, {
                query: expect.stringMatching(/SELECT TOP/i),
                parameters: [
                    { name: "@stream_id", value: "key-1" },
                    { name: "@sn", value: 3 },
                    { name: "@max", value: 1 },
                ],
            });
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(actual.lastSn).toBe(2);
            expect(actual.events.length).toBe(0);
            expect(actual.snapshot).toMatchObject({ foo: "bar" });
        });
    });
});
