/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

jest.mock("azure-storage", () => {
    return {
        BlobService: jest.fn(),
        createBlobService: jest.fn(),
    };
});

import { NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { createBlobService } from "azure-storage";
import { Span, SpanContext } from "opentracing";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";

const MockCreateBlobService: jest.Mock = createBlobService as any;

describe("BlobClient", () => {
    const config: IBlobStorageConfiguration = {
        container: "container123",
        storageAccount: "myAccount",
        storageAccessKey: "myKey",
    };
    const context: SpanContext = {};
    const span: Span = new NullTracerBuilder()
        .create()
        .startSpan("unit-test", { childOf: context });

    describe("Proceeds with expected failure", () => {
        const err = "A DEFINED VALUE";
        const text = "THIS BLOB OPERATION WILL FAIL";
        const response = { statusCode: 404 };

        beforeEach(() => {
            MockCreateBlobService.mockImplementation(() => {
                return {
                    getBlobToText: (_, __, ___, cb) => cb(err, text, _, response),
                    createBlockBlobFromText: (_, __, ____, _____, cb) => cb(err, _, response),
                };
            });
        });

        it("rejects on error from azure-storage for read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.read(span, "BlobID")).rejects.toMatch(err);
        });

        it("rejects on error from azure-storage for write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.write(span, "CONTENTS TO BE WRITTEN", "BlobID")
            ).rejects.toMatch(err);
        });
    });

    describe("Proceeds with expected success", () => {
        const err = undefined;
        const text = "THIS BLOB OPERATION WILL SUCCEED";
        const response = { statusCode: 200 };

        beforeEach(() => {
            MockCreateBlobService.mockImplementation(() => {
                return {
                    getBlobToText: (_, __, ___, cb) => cb(err, text, _, response),
                    createBlockBlobFromText: (_, __, ____, _____, cb) => cb(err, _, response),
                };
            });
        });

        it("performs a successful read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.read(span, "BlobID")).resolves.toBe(text);
        });

        it("performs a successful write", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.write(span, "CONTENTS TO BE WRITTEN", "BlobID")).resolves.toBe(
                undefined
            );
        });

        it("performs successful write for a request with specific timeout interval", async () => {
            const config: IBlobStorageConfiguration = {
                container: "container123",
                storageAccount: "myAccount",
                storageAccessKey: "myKey",
                requestTimeout: 1000,
            };
            const blobClient = new BlobClient(config);
            await expect(blobClient.write(span, "CONTENTS TO BE WRITTEN", "BlobID")).resolves.toBe(
                undefined
            );
        });
    });
});
