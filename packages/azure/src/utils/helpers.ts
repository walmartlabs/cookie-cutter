/**
 * Returns a collectionId from a provided key. If the key is not in the expected format,
 * undefined is returned
 * @param key A key in the format @collection/partitionKey
 */
export function getCollectionId(key: string): string | undefined {
    const collectionInfo: string[] = key.split("/");
    return collectionInfo.length === 1 ? collectionInfo[0].replace("@", "") : undefined;
}
