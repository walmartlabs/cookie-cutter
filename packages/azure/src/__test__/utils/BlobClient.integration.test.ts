/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BlobClient } from "../../utils";
import { SpanContext } from "opentracing";

const container = "default";
const storageAccount = "devstoreaccount1";
const storageAccessKey = process.env.AZURE_STORAGE_ACCESS_KEY;
const blobId = "defaultBlobId";
const url = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!url) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING env is not set");
}

// tslint:disable-next-line: no-console
console.log(JSON.stringify(process.env));
const client = new BlobClient({
    url,
    storageAccount,
    storageAccessKey,
    container,
});

const spanContext = new SpanContext();

beforeAll(async () => {
    await client.createContainerIfNotExists();

    await client.write(spanContext, "content", blobId);
});

describe("Blob Client", () => {
    describe("reads", () => {
        it("retrieves a known blob", async () => {
            const result = await client.read(spanContext, blobId);

            expect(result).toBe("content");
        });

        it("retrieves an unknown blob", async () => {
            expect.assertions(1);
            try {
                await client.read(spanContext, "unknownBlobId");
            } catch (error) {
                expect(error.statusCode).toBe(404);
            }
        });
    });

    describe("writes", () => {
        it("writes content to an existing blob", async () => {
            const content = `blob-content-${Date.now()}`;
            await client.write(spanContext, content, blobId);

            const result = await client.read(spanContext, blobId);

            expect(result).toBe(content);
        });

        it("writes content to a new blob", async () => {
            const content = `blob-content-${Date.now()}`;
            const newBlobId = "newBlobId";
            await client.write(spanContext, content, newBlobId);

            const result = await client.read(spanContext, newBlobId);

            expect(result).toBe(content);
        });
    });

    it("checks if a container exists", async () => {
        const result = await client.exists(spanContext, blobId);

        expect(result).toBe(true);
    });

    it("checks if an unknown container exists", async () => {
        const result = await client.exists(spanContext, "unknownBlobId");

        expect(result).toBe(false);
    });

    it("creates a new container", async () => {
        const container = `container-${Date.now()}`;
        const newContainerClient = new BlobClient({
            url,
            storageAccount,
            storageAccessKey,
            container,
        });

        await newContainerClient.createContainerIfNotExists();
        await newContainerClient.write(spanContext, "something", blobId);

        const result = await newContainerClient.exists(spanContext, blobId);

        expect(result).toBe(true);
    });
});
