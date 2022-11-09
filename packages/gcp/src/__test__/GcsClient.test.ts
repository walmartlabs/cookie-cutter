/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Storage } from "@google-cloud/storage";
import { DefaultComponentContext, NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext } from "opentracing";
import { Readable } from "stream";
import { gcsClient, IGCSConfiguration } from "..";

jest.mock("@google-cloud/storage", () => {
    return {
        Storage: jest.fn(),
    };
});

const MockStorage: jest.Mock = Storage as any;
const ctx = DefaultComponentContext;

describe("GcsClient", () => {
    const config: IGCSConfiguration = {
        bucketId: "bucket123",
        projectId: "myProject",
        clientEmail: "myEmail",
        privateKey: "myKey",
    };
    const context = new SpanContext();
    const span: Span = new NullTracerBuilder()
        .create()
        .startSpan("unit-test", { childOf: context });

    describe("Proceeds with expected failure", () => {
        const err = "A DEFINED VALUE";
        const content = Buffer.from("CONTENTS TO BE WRITTEN");
        const stream = new Readable({
            read(_size) {
                this.push(err);
            },
        });

        beforeEach(() => {
            const mockFile = {
                save: (_) => {
                    throw err;
                },
                createWriteStream: (_) => {
                    throw err;
                },
            };
            const mockBucket = {
                file: (_) => mockFile,
            };
            MockStorage.mockImplementation(() => {
                return {
                    bucket: () => mockBucket,
                };
            });
        });

        it("rejects on error from gcs for put", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObject(span.context(), content, "fileName")).rejects.toMatch(
                err
            );
        });

        it("rejects on error from gcs for put stream", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObjectAsStream(span.context(), stream, "fileName")).rejects.toMatch(
                err
            );
        });
    });

    describe("Proceeds with expected success", () => {
        const data = "CONTENTS TO BE WRITTEN";
        const content = Buffer.from(data);
        const mockWritable = {
            on: jest.fn().mockImplementation(function(this, event, handler) {
                if (event === "finish") {
                  handler();
                }
                return this;
            }),
        }
        const mockStream = {
            pipe: (_) => mockWritable,
            ...{} as any,
        }

        beforeEach(() => {
            const mockFile = {
                save: jest.fn(),
                createWriteStream: jest.fn().mockImplementationOnce(() => mockWritable),
            };
            const mockBucket = {
                file: (_) => mockFile,
            };
            MockStorage.mockImplementation(() => {
                return {
                    bucket: () => mockBucket,
                };
            });
        });

        it("performs a successful write", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObject(span.context(), content, "fileName")).resolves.toBe(
                undefined
            );
        });

        it("performs a successful write via readable stream", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObjectAsStream(span.context(), mockStream, "fileName")).resolves.toBe(
                undefined
            );
        });
    });
});
