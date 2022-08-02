/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import Long = require("long");
import { pbjsStaticModuleRegistry, ProtoJsonMessageEncoder } from "..";
import { loadTestProto } from "./helper";

const NOW = new Date();
const TYPE = "cookiecutter.test.SampleMessage";
const PAYLOAD = {
    id: 1,
    text: "foo",
    nested: [
        {
            time: toProtoTime(NOW),
        },
    ],
};

function toProtoTime(dt: Date): any {
    const ms = dt.getTime();
    return {
        seconds: Math.floor(ms / 1000),
        nanos: (ms % 1000) * 1000000,
    };
}

describe("ProtoJsonMessageEncoder", () => {
    it("encodes an IMessage payload into a JSON string buffer", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoJsonMessageEncoder(pbjsStaticModuleRegistry(root));
        const buffer = encoder.encode({
            type: TYPE,
            payload: PAYLOAD,
        });

        expect(buffer).toMatchObject(Buffer.from(JSON.stringify(PAYLOAD)));
    });

    it("creates a JSON object from an encoded IMessage payload json string buffer", async () => {
        // protobuf.js library converts large enough Numbers to Long and then back
        // to Number when we JSON.stringify the object
        const root = await loadTestProto();
        const encoder = new ProtoJsonMessageEncoder(pbjsStaticModuleRegistry(root));
        const buffer = encoder.encode({
            type: TYPE,
            payload: PAYLOAD,
        });

        const jsonEmbedding = encoder.toJsonEmbedding(buffer);
        expect(jsonEmbedding).toMatchObject(PAYLOAD);
    });

    it("creates an encoded JSON string buffer from JSON object", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoJsonMessageEncoder(pbjsStaticModuleRegistry(root));
        const encodedBuffer = encoder.fromJsonEmbedding(PAYLOAD);
        expect(JSON.parse(encodedBuffer.toString())).toMatchObject(PAYLOAD);
    });

    it("decodes an encoded buffer for an IMessage that was converted to a JSON object back into an IMessage", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoJsonMessageEncoder(pbjsStaticModuleRegistry(root));
        const encodedBuffer = encoder.fromJsonEmbedding(PAYLOAD);
        const decodedMsg = encoder.decode(encodedBuffer, TYPE);

        // protobuf.js by default converts large enough number values into Longs
        // when converting a plain javascript object to a proto type.
        expect(decodedMsg.payload.nested[0].time.seconds).toMatchObject(
            new Long(toProtoTime(NOW).seconds)
        );
    });
});
