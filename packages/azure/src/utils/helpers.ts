/**
 * Returns a collectionId from a provided key. If the key is not in the expected format,
 * undefined is returned
 * @param key A key in the format @collection/partitionKey
 */
export function getCollectionInfo(key: string): [string, string] {
    const collectionInfo: string[] = key.split("/");
    return collectionInfo.length === 2
        ? [collectionInfo[0].replace("@", ""), collectionInfo[1]]
        : [undefined, key];
}
