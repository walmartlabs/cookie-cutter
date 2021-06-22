/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Stream } from "stream";

/**
 * Returns a collectionId and partitionKey from a provided state key. If the input is not in the expected format,
 * undefined is returned.
 *
 * Only the following inputs are acceptable:
 *  - "partitionKey"
 *  - "@collection/partitionKey"
 *
 * @param inputKey A state key in the format @collectionId/partitionKey
 */
export function getCollectionInfo(key: string): { collectionId?: string; partitionKey: string } {
    const collectionInfo: string[] = key.split("/");

    let collectionId: string;
    let partitionKey: string;

    if (collectionInfo.length === 1) {
        partitionKey = collectionInfo[0];
        return { collectionId, partitionKey };
    }

    if (collectionInfo.length !== 2 || !collectionInfo[0].startsWith("@")) {
        return { collectionId, partitionKey };
    } else {
        collectionId = collectionInfo[0].replace("@", "");
        partitionKey = collectionInfo[1];
        return { collectionId, partitionKey };
    }
}

/**
 * Converts a readable stream to a string. Stores coverted data in chunks,
 * and on completion joins chunks together into a single string.
 * @param readableStream input to be converted to string
 */
export function streamToString(readableStream: Stream): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (data) => {
            chunks.push(data.toString());
        });
        readableStream.on("end", () => {
            resolve(chunks.join(""));
        });
        readableStream.on("error", reject);
    });
}
