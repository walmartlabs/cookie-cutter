/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { getCollectionInfo } from "../../utils/helpers";

describe("State Key Parsing", () => {
    it("parses a state key with a collectionId overwrite", () => {
        const inputKey = "@collection/key";
        const { collectionId, partitionKey } = getCollectionInfo(inputKey);

        expect(collectionId).toBe("collection");
        expect(partitionKey).toBe("key");
    });

    it("parses a state key with no collectionId overwrite", () => {
        const inputKey = "key";
        const { collectionId, partitionKey } = getCollectionInfo(inputKey);

        expect(collectionId).toBe(undefined);
        expect(partitionKey).toBe("key");
    });

    it("parses a state key with a state key in the @key format ", () => {
        const inputKey = "@key";
        const { collectionId, partitionKey } = getCollectionInfo(inputKey);

        expect(collectionId).toBe(undefined);
        expect(partitionKey).toBe("@key");
    });

    it("parses a state key with an incorrectly formatted collectionId overwrite", () => {
        const inputKey = "collection/key";
        const { collectionId, partitionKey } = getCollectionInfo(inputKey);

        expect(collectionId).toBe(undefined);
        expect(partitionKey).toBe(undefined);
    });
});
