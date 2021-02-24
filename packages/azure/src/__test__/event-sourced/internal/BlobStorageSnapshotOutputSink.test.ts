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

import { SpanContext } from "opentracing";
import { IBlobStorageConfiguration } from "../../..";
import { IBlobStorageSnapshotOutputSinkConfiguration } from "../../../event-sourced";
import { BlobStorageSnapshotOutputSink } from "../../../event-sourced/internal";
import { BlobClient } from "../../../utils";
import { makeAzureError, makeIterableIterator, makeReturnString } from "../../helper";

const MockBlobClient: jest.Mock = BlobClient as any;

describe("BlobStorageSnapshotOutputSink", () => {
    let readAsText: jest.Mock;
    let write: jest.Mock;
    beforeEach(() => {
        readAsText = jest.fn();
        write = jest.fn();
        MockBlobClient.mockImplementation(() => {
            return {
                readAsText,
                write,
            };
        });
    });

    const testKey = "UnitTestKey";
    const config: IBlobStorageConfiguration & IBlobStorageSnapshotOutputSinkConfiguration = {
        url: "mockUrl",
        storageAccessKey: "dummy_access_key",
        storageAccount: "snapshots",
        container: "unit-test",
        frequency: 1,
    };
    const span = new SpanContext();
    const somePayload = JSON.parse(
        '{"journeys": [{"prop1": "string one"},{"prop1": "string two"}]}'
    );

    describe("Responds to error from the underlying blob client", () => {
        const seqNum = 29;
        const error500 = makeAzureError(500, "OtherCode");
        function setUpOutputSinkOne(createsReturnObject: any): BlobStorageSnapshotOutputSink {
            write.mockReturnValueOnce(createsReturnObject);
            return new BlobStorageSnapshotOutputSink(config);
        }
        function setUpOutputSinkTwo(getsReturnObject: any): BlobStorageSnapshotOutputSink {
            write.mockReturnValueOnce(Promise.resolve());
            readAsText.mockReturnValueOnce(getsReturnObject);
            return new BlobStorageSnapshotOutputSink(config);
        }
        function setUpOutputSinkThree(
            getsReturnObject: any,
            createsReturnObject
        ): BlobStorageSnapshotOutputSink {
            write.mockReturnValueOnce(Promise.resolve());
            readAsText.mockReturnValueOnce(getsReturnObject);
            write.mockReturnValueOnce(createsReturnObject);
            return new BlobStorageSnapshotOutputSink(config);
        }
        it("throws any error generated when writing snapshot", async () => {
            const outputSink = setUpOutputSinkOne(Promise.reject(error500));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).rejects.toMatchObject(error500);
            expect(write).toHaveBeenCalledTimes(1);
            expect(readAsText).toHaveBeenCalledTimes(0);
        });
        it("creates lister file and data file for very first snapshot of stream", async () => {
            const atSn = seqNum + 1;
            const outputSink = setUpOutputSinkThree(
                Promise.reject(makeAzureError(404, "BlobNotFound")),
                Promise.resolve()
            );
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).resolves.toBe(undefined);
            expect(write).toHaveBeenCalledWith(
                span,
                `${testKey}-${atSn}`,
                JSON.stringify(somePayload)
            );
            expect(write).toHaveBeenCalledWith(span, testKey, JSON.stringify([atSn]));
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("throws error when trying to read the lister file and the container is not found", async () => {
            const error = makeAzureError(404, "ContainerNotFound");
            const outputSink = setUpOutputSinkTwo(Promise.reject(error));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).rejects.toMatchObject(error);
            expect(write).toHaveBeenCalledTimes(1);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("throws any other error generated when reading lister file", async () => {
            const outputSink = setUpOutputSinkTwo(Promise.reject(error500));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).rejects.toMatchObject(error500);
            expect(write).toHaveBeenCalledTimes(1);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("throws any error generated when writing lister file", async () => {
            const outputSink = setUpOutputSinkThree(
                Promise.resolve(makeReturnString([20, 40, 60, 80])),
                Promise.reject(error500)
            );
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).rejects.toMatchObject(error500);
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
    });
    describe("Handles expected failure", () => {
        const atSn = 30;
        const seqNum = atSn - 1;
        function setUpOutputSink(returnObject: any): BlobStorageSnapshotOutputSink {
            write.mockReturnValueOnce(Promise.resolve());
            readAsText.mockReturnValueOnce(returnObject);
            write.mockReturnValueOnce(Promise.resolve());
            return new BlobStorageSnapshotOutputSink(config);
        }
        it("overwrites lister file if it's malformed", async () => {
            const outputSink = setUpOutputSink(Promise.resolve(""));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, seqNum, somePayload))
            ).resolves.toBe(undefined);
            expect(write).toHaveBeenCalledWith(
                span,
                `${testKey}-${atSn}`,
                JSON.stringify(somePayload)
            );
            expect(write).toHaveBeenCalledWith(span, testKey, JSON.stringify([atSn]));
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
    });
    describe("Proceeds with expected success", () => {
        const sequenceList = [20, 40, 60, 80];
        const emptySequenceList: number[] = [];
        function setUpOutputSink(returnObject: any) {
            write.mockReturnValueOnce(Promise.resolve());
            readAsText.mockReturnValueOnce(Promise.resolve(returnObject));
            write.mockReturnValueOnce(Promise.resolve());
            return new BlobStorageSnapshotOutputSink(config);
        }
        function commonExpects(atSn: number) {
            expect(write).toHaveBeenCalledWith(
                span,
                `${testKey}-${atSn}`,
                JSON.stringify(somePayload)
            );
            expect(readAsText).toHaveBeenCalledWith(span, testKey);
        }
        it("adds the input sequences to an empty list of sequences", async () => {
            const atSn = 30;
            const outputSink = setUpOutputSink(makeReturnString(emptySequenceList));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            commonExpects(atSn);
            expect(write).toHaveBeenCalledWith(span, testKey, JSON.stringify([atSn]));
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("adds an input sequence that is smaller than all sequences", async () => {
            const atSn = 10;
            const outputSink = setUpOutputSink(makeReturnString(sequenceList));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            commonExpects(atSn);
            expect(write).toHaveBeenCalledWith(
                span,
                testKey,
                JSON.stringify([atSn, 20, 40, 60, 80])
            );
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("skips updating lister file when input sequence is exact match to an existing sequence", async () => {
            const atSn = 20;
            const outputSink = setUpOutputSink(makeReturnString(sequenceList));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            commonExpects(atSn);
            expect(write).toHaveBeenCalledTimes(1);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("adds an input sequence that is within the range of sequences", async () => {
            const atSn = 50;
            const outputSink = setUpOutputSink(makeReturnString(sequenceList));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            commonExpects(atSn);
            expect(write).toHaveBeenCalledWith(
                span,
                testKey,
                JSON.stringify([20, 40, atSn, 60, 80])
            );
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("adds an input sequence that is larger than all sequences", async () => {
            const atSn = 90;
            const outputSink = setUpOutputSink(makeReturnString(sequenceList));
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            commonExpects(atSn);
            expect(write).toHaveBeenCalledWith(
                span,
                testKey,
                JSON.stringify([20, 40, 60, 80, atSn])
            );
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
    });
    describe("Handles writing only every N snapshots", () => {
        const sequenceList = [20, 40, 60, 80];
        const frequencyConfig: IBlobStorageConfiguration &
            IBlobStorageSnapshotOutputSinkConfiguration = {
            url: "mockUrl",
            storageAccessKey: "dummy_access_key",
            storageAccount: "snapshots",
            container: "unit-test",
            frequency: 10,
        };

        function setUpOutputSink(
            config: IBlobStorageConfiguration & IBlobStorageSnapshotOutputSinkConfiguration
        ): BlobStorageSnapshotOutputSink {
            write.mockReturnValueOnce(Promise.resolve());
            readAsText.mockReturnValueOnce(makeReturnString(sequenceList));
            write.mockReturnValueOnce(Promise.resolve());
            return new BlobStorageSnapshotOutputSink(config);
        }
        it("writes the snapshot for frequency of 10", async () => {
            const atSn = 90;
            const outputSink = setUpOutputSink(frequencyConfig);
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            expect(write).toHaveBeenCalledTimes(2);
            expect(readAsText).toHaveBeenCalledTimes(1);
        });
        it("skips the snapshot for frequency of 10", async () => {
            const atSn = 81;
            const outputSink = setUpOutputSink(frequencyConfig);
            await expect(
                outputSink.sink(makeIterableIterator(testKey, atSn - 1, somePayload))
            ).resolves.toBe(undefined);
            expect(write).toHaveBeenCalledTimes(0);
            expect(readAsText).toHaveBeenCalledTimes(0);
        });
    });
});
