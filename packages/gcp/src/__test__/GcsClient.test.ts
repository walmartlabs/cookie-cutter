/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Storage } from "@google-cloud/storage";
import { DefaultComponentContext, NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext } from "opentracing";
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
        const content = new Buffer("CONTENTS TO BE WRITTEN");

        beforeEach(() => {
            MockStorage.mockImplementation(() => {
                return {
                    bucket: () => mockBucket,
                };
            });
            const mockBucket = {
                file: (_) => mockFile,
            };

            const mockFile = {
                save: (_) => {
                    throw err;
                },
            };
        });

        it("rejects on error from gcs for put", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObject(span.context(), content, "fileName")).rejects.toMatch(
                err
            );
        });
    });

    describe("Proceeds with expected success", () => {
        const content = new Buffer("CONTENTS TO BE WRITTEN");
        beforeEach(() => {
            // tslint:disable-next-line: no-identical-functions
            MockStorage.mockImplementation(() => {
                return {
                    bucket: () => mockBucket,
                };
            });
            const mockBucket = {
                file: (_) => mockFile,
            };

            const mockFile = {
                save: jest.fn(),
            };
        });

        it("performs a successful write", async () => {
            const client = gcsClient(config);
            await client.initialize(ctx);
            await expect(client.putObject(span.context(), content, "fileName")).resolves.toBe(
                undefined
            );
        });
    });
});
