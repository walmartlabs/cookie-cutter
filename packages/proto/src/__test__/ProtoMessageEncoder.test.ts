/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { pbjsStaticModuleRegistry, ProtoMessageEncoder } from "..";
import { loadTestProto } from "./helper";
import { IMessage } from "@walmartlabs/cookie-cutter-core";

describe("ProtoMessageEncoder", () => {
    const msg: IMessage = {
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

    it("preserves backwards compatibility for decoding before IEncodedMessageEmbedder was implemented", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root), false);

        // this is how it used to get serialized before `toJsonEmbedding` was available
        const json = JSON.stringify(encoder.encode(msg));
        const obj = JSON.parse(json);

        // since IEncodedMessageEmbedder was added the code will always
        // invoke `fromJsonEmbedding`, even if `toJsonEmbedding` was not
        // invoked when the data was saved
        const buffer = encoder.fromJsonEmbedding(obj);

        // the message should properly decode based on the buffer
        // returned from `fromJsonEmbedding`
        const decoded = encoder.decode(buffer, msg.type);
        expect(decoded).toMatchObject(msg);
    });
});
