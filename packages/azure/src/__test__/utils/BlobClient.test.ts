/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext } from "opentracing";
import { IBlobStorageConfiguration } from "../..";
import { BlobClient } from "../../utils";
import { BlobServiceClient } from "@azure/storage-blob";
import { streamToString } from "../../utils/helpers";

const MockBlobServiceClient: jest.Mock = BlobServiceClient as any;
const MockStreamToString: jest.Mock = streamToString as any;

jest.mock("@azure/storage-blob", () => {
    return {
        BlobServiceClient: jest.fn().mockImplementation(() => jest.fn()),
    };
});

jest.mock("../../utils/helpers", () => {
    return {
        streamToString: jest.fn().mockImplementation(() => jest.fn()),
    };
});

const success = Promise.resolve("A DEFINED VALUE");
const failure = Promise.reject("A DEFINED VALUE");

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
        const errorMessage = "A DEFINED VALUE";
        const err = new Error(errorMessage);

        beforeAll(() => {
            MockBlobServiceClient.mockImplementation(() => {
                return {
                    createContainer: jest.fn(),
                    getContainerClient: jest.fn(() => {
                        return {
                            getBlobClient: jest.fn(() => {
                                return {
                                    download: jest.fn(() => failure),
                                    upload: jest.fn(() => failure),
                                    write: jest.fn(() => success),
                                    exists: jest.fn(() => success),
                                };
                            }),
                            getBlockBlobClient: jest.fn(() => {
                                return {
                                    upload: jest.fn(() => failure),
                                    download: jest.fn(() => success),
                                };
                            }),
                        };
                    }),
                    listContainers: jest.fn(() => {
                        return {
                            next: jest.fn(() => {
                                throw new Error("A DEFINED VALUE");
                            }),
                        };
                    }),
                };
            });
        });

        it("rejects on error from azure-storage for read", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.read(span.context(), "BlobID")).rejects.toMatch(errorMessage);
        });

        it("rejects on error from azure-storage for write", async () => {
            const blobClient = new BlobClient(config);
            await expect(
                blobClient.write(span.context(), "CONTENTS TO BE WRITTEN", "BlobID")
            ).rejects.toMatch(errorMessage);
        });

        it("rejects on error from azure-storage for 'exists'", async () => {
            const blobClient = new BlobClient(config);
            await expect(blobClient.exists(span.context(), "BlobID")).rejects.toMatchObject(err);
        });
    });

    describe("Proceeds with expected success", () => {
        const text = "THIS BLOB OPERATION WILL SUCCEED";

        beforeAll(() => {
            MockStreamToString.mockImplementation(() => {
                return text;
            });
            MockBlobServiceClient.mockImplementation(() => {
                return {
                    createContainer: jest.fn(),
                    getContainerClient: jest.fn(() => {
                        return {
                            getBlobClient: jest.fn(() => {
                                return {
                                    download: jest.fn(() =>
                                        Promise.resolve({
                                            _response: {
                                                status: 200,
                                            },
                                            readableStreamBody: text,
                                        })
                                    ),
                                    upload: jest.fn(() => success),
                                    write: jest.fn(() => success),
                                    exists: jest.fn(() => success),
                                };
                            }),
                            getBlockBlobClient: jest.fn(() => {
                                return {
                                    upload: jest.fn(() =>
                                        Promise.resolve({
                                            _response: {
                                                status: 200,
                                            },
                                            readableStreamBody: text,
                                        })
                                    ),
                                    download: jest.fn(() => success),
                                };
                            }),
                        };
                    }),
                    listContainers: jest.fn(() => {
                        return {
                            next: jest.fn(() => {
                                return {
                                    value: {
                                        name: "BlobID",
                                    },
                                    done: false,
                                };
                            }),
                        };
                    }),
                };
            });
        });

        const config: IBlobStorageConfiguration = {
            container: "container123",
            storageAccount: "myAccount",
            storageAccessKey: "myKey",
        };
        const context = new SpanContext();
        const span: Span = new NullTracerBuilder()
            .create()
            .startSpan("unit-test", { childOf: context });
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
