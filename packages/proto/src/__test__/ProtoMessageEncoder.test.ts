/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { pbjsStaticModuleRegistry, ProtoMessageEncoder } from "..";
import { loadTestProto } from "./helper";

describe("ProtoMessageEncoder", () => {
    it("encodes an IMessage into a buffer", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root));
        const encodedMsg = encoder.encode({
            type: "cookiecutter.test.SampleMessage",
            payload: {
                id: 2,
                text: "hello",
                nest: [
                    {
                        text: "world",
                    },
                ],
            },
        });

        expect(encodedMsg.length).toBeGreaterThan(0);
    });

    it("performs round-trip encoding", async () => {
        const root = await loadTestProto();
        const encoder = new ProtoMessageEncoder(pbjsStaticModuleRegistry(root));
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
        const encodedMsg = encoder.encode(msg);
        const decoded = encoder.decode(encodedMsg, msg.type);

        expect(decoded).toMatchObject(msg);
    });
});
