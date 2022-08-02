/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BlobClient } from "../../utils";
import { SpanContext } from "opentracing";

jest.setTimeout(90000);

describe("Blob Client", () => {
    const storageAccount = process.env.AZURE_STORAGE_ACCOUNT;
    const storageAccessKey = process.env.AZURE_STORAGE_ACCESS_KEY;
    const storageUrl = process.env.AZURE_STORAGE_URL;
    const container = "defaultcontainer";

    const client = new BlobClient({
        storageAccount,
        storageAccessKey,
        url: storageUrl,
        container,
    });

    const spanContext = new SpanContext();

    beforeAll(async () => {
        await client.createContainerIfNotExists();
    });

    describe("createContainerIfNotExists()", () => {
        it("creates a new container using url, account and accesskey, and tests a write into it", async () => {
            const newClient = new BlobClient({
                url: storageUrl,
                storageAccount,
                storageAccessKey,
                container: "new-container",
            });
            const newBlobId = "newBlobId";

            try {
                await newClient.createContainerIfNotExists();

                await newClient.write(spanContext, newBlobId, "something");

                const result = await newClient.exists(spanContext, newBlobId);
                expect(result).toBe(true);
            } finally {
                await newClient.deleteBlobIfExists(spanContext, newBlobId);
                await newClient.deleteContainerIfExists();
            }
        });

        it("tries to create an already existing container and gets the response as false", async () => {
            const newClient = new BlobClient({
                url: storageUrl,
                storageAccount,
                storageAccessKey,
                container: "oldcontainer",
            });

            try {
                let result = await newClient.createContainerIfNotExists();
                expect(result).toBe(true);

                result = await newClient.createContainerIfNotExists();
                expect(result).toBe(false);
            } finally {
                await newClient.deleteContainerIfExists();
            }
        });
    });

    describe("readAsText()", () => {
        it("retrieves a known blob", async () => {
            const knownBlobId = "knowBlobId";

            try {
                await client.write(spanContext, knownBlobId, "content");

                const result = await client.readAsText(spanContext, knownBlobId);
                expect(result).toBe("content");
            } finally {
                await client.deleteBlobIfExists(spanContext, knownBlobId);
            }
        });

        it("retrieves an unknown blob", async () => {
            try {
                await client.readAsText(spanContext, "unknownBlobId");
            } catch (error) {
                expect((error as any).statusCode).toBe(404);
            }
        });
    });

    describe("writes()", () => {
        it("writes small text (includes a special unicode character) to a new blob", async () => {
            const newBlobId = "newBlobId";

            try {
                const content = "blob-content-ä";
                await client.write(spanContext, newBlobId, content);

                const result = await client.readAsText(spanContext, newBlobId);
                expect(result).toBe(content);
            } finally {
                await client.deleteBlobIfExists(spanContext, newBlobId);
            }
        });

        it("writes small text to an existing blob", async () => {
            const existingBlobId = "existingBlobId";

            try {
                await client.write(spanContext, existingBlobId, "oldcontent");

                const newContent = "new-content";
                await client.write(spanContext, existingBlobId, newContent);

                const result = await client.readAsText(spanContext, existingBlobId);
                expect(result).toBe(newContent);
            } finally {
                await client.deleteBlobIfExists(spanContext, existingBlobId);
            }
        });

        it("writes small Buffer to a new blob", async () => {
            const newBlobId = "newBlobId";

            try {
                const content = Buffer.from("small-buffer-text");
                await client.write(spanContext, newBlobId, content);

                const result = await client.exists(spanContext, newBlobId);
                expect(result).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, newBlobId);
            }
        });

        it("writes large text to a new blob", async () => {
            const largeBlobId = "largeBlobId";
            const largeText: string = "x".repeat(70 * 1024 * 1024);

            try {
                await client.write(spanContext, largeBlobId, largeText);

                const result = await client.readAsText(spanContext, largeBlobId);
                expect(result).toEqual(largeText);
            } finally {
                await client.deleteBlobIfExists(spanContext, largeBlobId);
            }
        });

        it("writes large Bufffer to a new blob", async () => {
            const largeBlobId = "largeBlobId";
            const largeBuffer: Buffer = Buffer.from("x".repeat(70 * 1024 * 1024));

            try {
                await client.write(spanContext, largeBlobId, largeBuffer);

                const result = await client.exists(spanContext, largeBlobId);
                expect(result).toEqual(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, largeBlobId);
            }
        });
    });

    describe("exists()", () => {
        it("checks if a known Blob exists", async () => {
            const knownBlobId = "knowBlobId";

            try {
                await client.write(spanContext, knownBlobId, "content");

                const result = await client.exists(spanContext, knownBlobId);
                expect(result).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, knownBlobId);
            }
        });

        it("checks if a non-existent Blob exists", async () => {
            const result = await client.exists(spanContext, "unknownBlobId");
            expect(result).toBe(false);
        });
    });

    describe("listBlobs()", () => {
        it("lists all the Blobs with a given prefix", async () => {
            const blobA = "prefixABlobA";
            const blobB = "prefixABlobB";
            const blobC = "prefixCBlobC";

            try {
                await client.write(spanContext, blobA, "content");
                await client.write(spanContext, blobB, "content");
                await client.write(spanContext, blobC, "content");

                const iterator = await client.listBlobs(spanContext, "prefixA");

                expect((await iterator.next()).value).toEqual("prefixABlobA");
                expect((await iterator.next()).value).toEqual("prefixABlobB");
                expect((await iterator.next()).done).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, blobA);
                await client.deleteBlobIfExists(spanContext, blobB);
                await client.deleteBlobIfExists(spanContext, blobC);
            }
        });

        it("lists all the Blobs with under a folder (folder name as the prefix)", async () => {
            const blobA = "folderA/BlobA";
            const blobB = "folderA/BlobB";
            const blobC = "folderC/BlobC";

            try {
                await client.write(spanContext, blobA, "content");
                await client.write(spanContext, blobB, "content");
                await client.write(spanContext, blobC, "content");

                const iterator = await client.listBlobs(spanContext, "folderA");

                expect((await iterator.next()).value).toEqual("folderA/BlobA");
                expect((await iterator.next()).value).toEqual("folderA/BlobB");
                expect((await iterator.next()).done).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, blobA);
                await client.deleteBlobIfExists(spanContext, blobB);
                await client.deleteBlobIfExists(spanContext, blobC);
            }
        });

        it("lists all the Blobs under a non-existent prefix", async () => {
            const blobA = "folderA/BlobA";
            const blobB = "folderA/BlobB";
            const blobC = "folderC/BlobC";

            try {
                await client.write(spanContext, blobA, "content");
                await client.write(spanContext, blobB, "content");
                await client.write(spanContext, blobC, "content");

                const iterator = await client.listBlobs(spanContext, "folderUnknown");
                expect((await iterator.next()).done).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, blobA);
                await client.deleteBlobIfExists(spanContext, blobB);
                await client.deleteBlobIfExists(spanContext, blobC);
            }
        });
    });

    describe("deleteBlobIfExists()", () => {
        it("deletes a known blob", async () => {
            const knownBlobId = "knowBlobId";
            await client.write(spanContext, knownBlobId, "content");

            const result = await client.deleteBlobIfExists(spanContext, knownBlobId);
            expect(result).toBe(true);
        });

        it("tries to delete a non-existent blob", async () => {
            const result = await client.deleteBlobIfExists(spanContext, "unknownBlobId");
            expect(result).toBe(false);
        });
    });

    describe("deleteFolderIfExists()", () => {
        it("deletes a known folder", async () => {
            const blobA = "folderA/BlobA";
            const blobB = "folderA/BlobB";
            const blobC = "folderC/BlobC";

            try {
                await client.write(spanContext, blobA, "content");
                await client.write(spanContext, blobB, "content");
                await client.write(spanContext, blobC, "content");

                const result = await client.deleteFolderIfExists(spanContext, "folderA");
                expect(result).toBe(true);

                const iterator = await client.listBlobs(spanContext, "folder");
                expect((await iterator.next()).value).toEqual("folderC/BlobC");
                expect((await iterator.next()).done).toBe(true);
            } finally {
                await client.deleteBlobIfExists(spanContext, blobA);
                await client.deleteBlobIfExists(spanContext, blobB);
                await client.deleteBlobIfExists(spanContext, blobC);
            }
        });

        it("tries to delete a non-existent folder", async () => {
            const result = await client.deleteFolderIfExists(spanContext, "unknownFolder");
            expect(result).toBe(false);
        });
    });
});
