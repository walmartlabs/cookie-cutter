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
