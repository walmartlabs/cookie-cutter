/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

jest.mock("@azure/storage-blob", () => {
    return {
        BlobServiceClient: jest.fn().mockImplementation(() => {
            return {
                getContainerClient: () => jest.fn(), // TODO update to a useful return value
                listContainers: () => jest.fn(), // TODO update to a useful return value
            };
        }),
    };
});

import { NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext } from "opentracing";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";

describe("BlobClient", () => {
    const config: IBlobStorageConfiguration = {
        container: "container123",
        storageAccount: "myAccount",
        storageAccessKey: "myKey",
    };
    const context = new SpanContext();
    const span: Span = new NullTracerBuilder()
        .create()
        .startSpan("unit-test", { childOf: context });

    describe("Proceeds with expected failure", () => {
        const err = "A DEFINED VALUE";

        it("rejects on error from azure-storage for read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.read(span.context(), "BlobID")).rejects.toMatch(err);
        });

        it("rejects on error from azure-storage for write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.write(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).rejects.toMatch(err);
        });

        it("rejects on error from azure-storage for 'exists'", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.exists(span.context(), "BlobID")).rejects.toMatch(err);
        });
    });

    describe("Proceeds with expected success", () => {
        const text = "THIS BLOB OPERATION WILL SUCCEED";

        it("performs a successful read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.read(span.context(), "BlobID")).resolves.toBe(text);
        });

        it("performs a successful write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.write(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).resolves.toBe(undefined);
        });

        it("performs successful write for a request with specific timeout interval", async () => {
            const config: IBlobStorageConfiguration = {
                container: "container123",
                storageAccount: "myAccount",
                storageAccessKey: "myKey",
                requestTimeout: 1000,
            };
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.write(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).resolves.toBe(undefined);
        });

        it("performs a successful 'exists'", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.exists(span.context(), "BlobID")).resolves.toEqual(true);
        });
    });
});
