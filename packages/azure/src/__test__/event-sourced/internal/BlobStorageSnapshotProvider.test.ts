/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

jest.mock("../../../utils/BlobClient", () => {
    return {
        BlobClient: jest.fn(),
    };
});

import { IBlobStorageConfiguration } from "../../..";
import { BlobStorageSnapshotProvider } from "../../../event-sourced/internal";
import { BlobClient } from "../../../utils/BlobClient";
import { IAzureError, makeAzureError, makeReturnString } from "../../helper";

const MockBlobClient: jest.Mock = BlobClient as any;

describe("BlobStorageSnapshotProvider", () => {
    let readAsText: jest.Mock;
    beforeEach(() => {
        readAsText = jest.fn();
        MockBlobClient.mockImplementation(() => {
            return {
                readAsText,
            };
        });
    });

    const testKey = "UnitTestKey";
    const config: IBlobStorageConfiguration = {
        storageAccount: "snapshots",
        storageAccessKey: "dummy_access_key",
        container: "unit-test",
    };

    describe("Responds to error from the underlying blob service", () => {
        const atSn = 20;
        function setUpProvider(error: IAzureError): BlobStorageSnapshotProvider<any> {
            readAsText.mockReturnValueOnce(Promise.reject(error));
            return new BlobStorageSnapshotProvider<any>(config);
        }

        it("returns no snapshot if the file is not found", async () => {
            const snapshotProvider = setUpProvider(makeAzureError(404, "BlobNotFound"));
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });

        it("returns no snapshot if the container is not found", async () => {
            const snapshotProvider = setUpProvider(makeAzureError(404, "ContainerNotFound"));
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });

        it("throws any other 404 error generated when reading a file", async () => {
            const error = makeAzureError(404, "OtherCode");
            const snapshotProvider = setUpProvider(error);
            await expect(snapshotProvider.get(undefined, testKey, atSn)).rejects.toMatchObject(
                error
            );
            expect(readAsText).toHaveBeenCalledTimes(1);
        });

        it("throws any other error generated when reading a file", async () => {
            const error = makeAzureError(400, "OtherCode");
            const snapshotProvider = setUpProvider(error);
            await expect(snapshotProvider.get(undefined, testKey, atSn)).rejects.toMatchObject(
                error
            );
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
    });

    describe("Handles expected failure", () => {
        const atSn = 20;
        const sequenceList = [20, 40, 60, 80];
        const emptySequenceList: number[] = [];
        function setUpProvider(
            listerReturnObject: any,
            snapshotReturnObject: any
        ): BlobStorageSnapshotProvider<any> {
            readAsText.mockReturnValueOnce(Promise.resolve(listerReturnObject));
            readAsText.mockReturnValueOnce(Promise.resolve(snapshotReturnObject));
            return new BlobStorageSnapshotProvider<any>(config);
        }

        it("returns no snapshot if lister file is malformed", async () => {
            const snapshotProvider = setUpProvider("", undefined);
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });

        it("returns no snapshot if snapshot file is malformed", async () => {
            const snapshotProvider = setUpProvider(makeReturnString(sequenceList), "");
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(2);
        });

        it("returns no snapshot if requested sequence is smaller than all saved sequences", async () => {
            const atSn = 10;
            const snapshotProvider = setUpProvider(makeReturnString(sequenceList), undefined);
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });

        it("returns no snapshot if the list of saved sequences is empty", async () => {
            const snapshotProvider = setUpProvider(makeReturnString(emptySequenceList), undefined);
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                0,
                undefined,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
    });

    describe("Proceeds with expected success", () => {
        const sequenceList = [20, 40, 60, 80];
        const snapshotContents = { prop1: "prop1", prop2: "prop2" };

        function setUpProvider(): BlobStorageSnapshotProvider<any> {
            readAsText.mockReturnValueOnce(Promise.resolve(makeReturnString(sequenceList)));
            readAsText.mockReturnValueOnce(Promise.resolve(makeReturnString(snapshotContents)));
            return new BlobStorageSnapshotProvider<any>(config);
        }

        it("returns a snapshot which is exact match of the requested snapshot", async () => {
            const snapshotProvider = setUpProvider();
            const [atSn, expectedReturnSn] = [60, 60];
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                expectedReturnSn,
                snapshotContents,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenLastCalledWith(
                undefined,
                `${testKey}-${expectedReturnSn}`
            );
        });

        it("returns a snapshot from inside the list of snapshots", async () => {
            const snapshotProvider = setUpProvider();
            const [atSn, expectedReturnSn] = [45, 40];
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                expectedReturnSn,
                snapshotContents,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenLastCalledWith(
                undefined,
                `${testKey}-${expectedReturnSn}`
            );
        });

        it("returns the latest available snapshot since the requested sequence is larger than all stored sequences", async () => {
            const snapshotProvider = setUpProvider();
            const [atSn, expectedReturnSn] = [100, 80];
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                expectedReturnSn,
                snapshotContents,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenLastCalledWith(
                undefined,
                `${testKey}-${expectedReturnSn}`
            );
        });

        it("returns the latest available snapshot since no request sequence was provided", async () => {
            const snapshotProvider = setUpProvider();
            const [atSn, expectedReturnSn] = [undefined, 80];
            expect(await snapshotProvider.get(undefined, testKey, atSn)).toMatchObject([
                expectedReturnSn,
                snapshotContents,
            ]);
            expect(readAsText).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenLastCalledWith(
                undefined,
                `${testKey}-${expectedReturnSn}`
            );
        });
    });
});
