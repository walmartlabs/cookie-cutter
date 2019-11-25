---
id: comp-encoding
title: Encoding
---

Input sources, output sinks and state providers will typically require a mechanism to decode a message coming off the wire or encode a message to put onto the write respectively. Cookie Cutter provides this functionality via its `IMessageEncoder` abstraction.

## Interfaces

```typescript
export interface IMessageEncoder {
    readonly mimeType: string;
    encode(msg: IMessage): Uint8Array;
    decode(data: Uint8Array, typeName: string): IMessage;
}

export interface IEncodedMessageEmbedder {
    toJsonEmbedding(encoded: Uint8Array): any;
    fromJsonEmbedding(embedding: any): Uint8Array;
}
```

Any encoder must implement `IMessageEncoder` and may optionally implement `IEncodedMessageEmbedder`. The latter is used for storage mechanisms that use JSON natively and it allows the data to be formatted nicely so it remains human-readable; for example the `encode` function of the `JsonMessageEncoder` returns a byte array that contains the serialized JSON. If the underlying storage mechanism itself is JSON then we wouldn't want the data to be stored as a base64 representation of that byte array, but as the data itself.

## JsonMessageEncoder

The `JsonMessageEncoder` encodes the payload of `IMessage` as JSON. On the decoding side it requires a `typeName` hint to be passed in as the JSON itself doesn't contain any information about the type name.

## CsvMessageEncoder

The `CsvMessageEncoder` encodes the payload of `IMessage` as CSV. The constructor requires the names of the header columns (which have to match the field names of the payload object), the delimiter to use and optionally a fixed type name if no type name hint can be passed into the `decode` function.
