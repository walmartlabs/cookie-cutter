import { getCollectionInfo } from "../../utils/helpers";

describe("Collection Info helper test", () => {
    it("correctly parses a collectionId and partition key", () => {
        const test = "@collection/key";
        const result: [string, string] = getCollectionInfo(test);

        expect(result[0]).toBe("collection");
        expect(result[1]).toBe("key");
    });

    it("correctly parses a partition key with no collection", () => {
        const test = "key";
        const result: [string, string] = getCollectionInfo(test);

        expect(result[0]).toBe(undefined);
        expect(result[1]).toBe("key");
    });
});
