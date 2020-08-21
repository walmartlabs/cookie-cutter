/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { pbjsStaticModuleRegistry, ProtoMessageEncoder } from "..";
import { loadTestProto } from "./helper";

describe("ProtoMessageEncoder", () => {
    const msg = {
        type: "cookiecutter.test.SampleMessage",
        payload: {
            id: 2,
            text: "hello",
            nested: [
                {
                    text: "world",
                },
            ],
        },
    };

    it("encodes an IMessage into a buffer", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root));
        const encodedMsg = encoder.encode(msg);

        expect(encodedMsg.length).toBeGreaterThan(0);
    });

    it("performs round-trip encoding", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root));
        const encodedMsg = encoder.encode(msg);
        const decoded = encoder.decode(encodedMsg, msg.type);

        expect(decoded).toMatchObject(msg);
    });

    it("returns Uint8Array from toJsonEmbedding when base64Encode is false", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root), false);
        const encodedMsg = encoder.encode(msg);
        const notBase64Encoded = encoder.toJsonEmbedding(encodedMsg);

        expect(notBase64Encoded).toMatchObject(encodedMsg);
    });

    it("performs round-trip base64 encoding", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root), true);
        const encodedMsg = encoder.encode(msg);
        const base64Encoded = encoder.toJsonEmbedding(encodedMsg);
        const base64Decoded = encoder.fromJsonEmbedding(base64Encoded);
        const decodedMsg = encoder.decode(base64Decoded, msg.type);

        expect(base64Decoded).toMatchObject(encodedMsg);
        expect(decodedMsg).toMatchObject(msg);
    });
});
