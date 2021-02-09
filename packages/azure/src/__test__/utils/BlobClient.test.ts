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

jest.mock("fs", () => {
    return {
        promises: {
            writeFile: jest.fn(),
            unlink: jest.fn(),
        },
    };
});

import { NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { BlobService, createBlobService } from "azure-storage";
import { Span, SpanContext } from "opentracing";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";

const createBlobServiceMock: jest.Mock = createBlobService as any;

describe("BlobClient", () => {
    const config: IBlobStorageConfiguration = {
        container: "container123",
        storageAccount: "myAccount",
        storageAccessKey: "myKey",
        localStoragePath: "path1",
    };
    const context = new SpanContext();
    const span: Span = new NullTracerBuilder()
        .create()
        .startSpan("unit-test", { childOf: context });

    describe("Proceeds with expected failure", () => {
        const err = "A DEFINED VALUE";
        const text = "THIS BLOB OPERATION WILL FAIL";
        const response = { statusCode: 404 };

        beforeEach(() => {
            createBlobServiceMock.mockImplementation(() => {
                return {
                    getBlobToText: (_container, _blob, _options, cb) =>
                        cb(err, text, undefined, response),
                    createBlockBlobFromText: (_container, _blob, _text, _options, cb) =>
                        cb(err, undefined, response),
                    doesBlobExist: (_container, _blob, cb) => cb(err, undefined, response),
                };
            });
        });

        it("rejects on error from azure-storage for read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.readAsText(span.context(), "BlobID")).rejects.toMatch(err);
        });

        it("rejects on error from azure-storage for write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.writeAsText(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).rejects.toMatch(err);
        });

        it("rejects on error from azure-storage for 'exists'", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.exists(span.context(), "BlobID")).rejects.toMatch(err);
        });
    });

    describe("Proceeds with expected success", () => {
        const err = undefined;
        const text = "THIS BLOB OPERATION WILL SUCCEED";
        const response = { statusCode: 200 };
        const exists = { exists: true };

        beforeEach(() => {
            createBlobServiceMock.mockImplementation(() => {
                return {
                    getBlobToText: (_container, _blob, _options, cb) =>
                        cb(err, text, undefined, response),
                    createBlockBlobFromText: (_container, _blob, _text, _options, cb) =>
                        cb(err, undefined, response),
                    doesBlobExist: (_container, _blob, cb) => cb(err, exists, response),
                };
            });
        });

        it("performs a successful read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.readAsText(span.context(), "BlobID")).resolves.toBe(text);
        });

        it("performs a successful write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.writeAsText(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
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
                blobClient.writeAsText(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).resolves.toBe(undefined);
        });

        it("performs a successful 'exists'", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.exists(span.context(), "BlobID")).resolves.toEqual(true);
        });
    });

    describe("Tests writeAsText()", () => {
        test("writeAsText() performs a successful write", async () => {
            const response: any = { statusCode: 200 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    createBlockBlobFromLocalFile: (_container, _blob, _fileName, _options, cb) =>
                        cb(undefined, undefined, response),
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            await expect(
                blobClient.writeAsLargeText("large text", "BlobID", span.context())
            ).resolves.toBe(undefined);
        });

        test("writeAsText() fails on an error from Blob service ", async () => {
            const error: Error = new Error("Mock Error 1");
            const response: any = { statusCode: 400 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    createBlockBlobFromLocalFile: (_container, _blob, _fileName, _options, cb) => {
                        cb(error, undefined, response);
                    },
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            let exceptionThrown: string = null;
            try {
                expect(await blobClient.writeAsLargeText("", "BlobID", span.context()));
            } catch (e) {
                exceptionThrown = e;
            }
            expect(exceptionThrown).toBe(error);
        });
    });

    describe("Tests deleteFolderIfExists()", () => {
        test("deleteFolderIfExists() perrforms a successful delete and returns true", async () => {
            const blobClient: BlobClient = new BlobClient(config);
            blobClient.listAllBlobs = jest
                .fn()
                .mockResolvedValue(["bucket/BlobFolder/a", "bucket/BlobFolder/b"]);
            blobClient.deleteBlobIfExists = jest.fn().mockResolvedValue(true);

            const result: Promise<boolean> = blobClient.deleteFolderIfExists(
                "bucket/BlobFolder",
                span.context()
            );
            await expect(result).resolves.toBe(true);
        });

        test("deleteFolderIfExists() returns false if deletes didnt happen cuz blobs dont exist", async () => {
            const blobClient: BlobClient = new BlobClient(config);
            blobClient.listAllBlobs = jest.fn().mockResolvedValue([]);
            blobClient.deleteBlobIfExists = jest.fn().mockResolvedValue(false);

            const result: Promise<boolean> = blobClient.deleteFolderIfExists(
                "BlobFolder",
                span.context()
            );
            await expect(result).resolves.toBe(false);
        });
    });

    describe("Tests deleteBlobIfExists()", () => {
        test("deleteBlobIfExists() perform a successful delete and returns true", async () => {
            const response: any = { statusCode: 200 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    deleteBlobIfExists: (_container, _blob, cb) => cb(undefined, true, response),
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            await expect(blobClient.deleteBlobIfExists("BlobID", span.context())).resolves.toBe(
                true
            );
        });

        test("deleteBlobIfExists() attempts to perform a delete, but resource doesn't exist and returns false", async () => {
            const response: any = { statusCode: 200 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    deleteBlobIfExists: (_container, _blob, cb) => cb(undefined, false, response),
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            await expect(blobClient.deleteBlobIfExists("BlobID", span.context())).resolves.toBe(
                false
            );
        });

        test("deleteBlobIfExists() fails on an error from Blob service ", async () => {
            const exception: Error = new Error("Mock Error 2");
            const response: any = { statusCode: 400 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    deleteBlobIfExists: (_container, _blob, cb) => {
                        cb(exception, undefined, response);
                    },
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            let exceptionThrown: string = null;
            try {
                expect(await blobClient.deleteBlobIfExists("BlobID", span.context()));
            } catch (e) {
                exceptionThrown = e;
            }
            expect(exceptionThrown).toBe(exception);
        });
    });

    describe("Tests listAllBlobs()", () => {
        test("listAllBlobs() returns list of all blobs in the first fetch", async () => {
            const blobFolderPrefix: string = "BlobFolder";

            createBlobServiceMock.mockImplementation(() => {
                return {
                    listBlobsSegmentedWithPrefix: (_container, _prefix, _cToken, cb) =>
                        cb(
                            undefined,
                            {
                                entries: [
                                    { name: `${blobFolderPrefix}/a` },
                                    { name: `${blobFolderPrefix}/b` },
                                ],
                                continuationToken: null,
                            } as BlobService.ListBlobsResult,
                            { statusCode: 200 }
                        ),
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            /* tslint:disable-next-line:no-floating-promises */
            expect(blobClient.listAllBlobs(blobFolderPrefix, span.context())).resolves.toEqual([
                `${blobFolderPrefix}/a`,
                `${blobFolderPrefix}/b`,
            ]);
        });

        test("listAllBlobs() returns list of all blobs with multiple fetches (using continuationToken)", async () => {
            const mockListBlobsSegmentedWithPrefix: jest.Mock = jest.fn();
            createBlobServiceMock.mockImplementationOnce(() => {
                return {
                    listBlobsSegmentedWithPrefix: mockListBlobsSegmentedWithPrefix,
                };
            });

            const blobFolderPrefix: string = "BlobFolder";
            mockListBlobsSegmentedWithPrefix
                .mockImplementationOnce((_container, _prefix, _cToken, cb) =>
                    cb(
                        undefined,
                        {
                            entries: [
                                { name: `${blobFolderPrefix}/a` },
                                { name: `${blobFolderPrefix}/b` },
                            ],
                            continuationToken: { nextMarker: "a" },
                        } as BlobService.ListBlobsResult,
                        { statusCode: 200 }
                    )
                )
                .mockImplementationOnce((_container, _prefix, _cToken, cb) =>
                    cb(
                        undefined,
                        {
                            entries: [
                                { name: `${blobFolderPrefix}/c` },
                                { name: `${blobFolderPrefix}/d` },
                            ],
                            continuationToken: null,
                        } as BlobService.ListBlobsResult,
                        { statusCode: 200 }
                    )
                );

            const blobClient: BlobClient = new BlobClient(config);
            /* tslint:disable-next-line:no-floating-promises */
            expect(blobClient.listAllBlobs(blobFolderPrefix, span.context())).resolves.toEqual([
                `${blobFolderPrefix}/a`,
                `${blobFolderPrefix}/b`,
                `${blobFolderPrefix}/c`,
                `${blobFolderPrefix}/d`,
            ]);
        });

        test("listAllBlobs() fails on an error from Blob service ", async () => {
            const error: Error = new Error("Mock Error 3");
            const response: any = { statusCode: 400 };

            createBlobServiceMock.mockImplementation(() => {
                return {
                    listBlobsSegmentedWithPrefix: (_container, _prefix, _cToken, cb) =>
                        cb(error, undefined, response),
                };
            });

            const blobClient: BlobClient = new BlobClient(config);
            /* tslint:disable-next-line:no-floating-promises */
            expect(blobClient.listAllBlobs("BlobFolderPrefix", span.context())).rejects.toEqual(
                error
            );
        });
    });
});
