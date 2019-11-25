/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { pbjsStaticModuleRegistry } from "..";
import { ProtoMessageTypeMapper } from "../ProtoMessageTypeMapper";
import { loadTestProto } from "./helper";

describe("ProtoMessageTypeMapper", () => {
    it("returns namespace + type for encoder", async () => {
        const root = await loadTestProto();
        const mapper = new ProtoMessageTypeMapper(pbjsStaticModuleRegistry(root));
        const actual = mapper.map(root.cookiecutter.test.SampleMessage);
        expect(actual).toMatch("cookiecutter.test.SampleMessage");
    });

    it("throws for unknown encoders", async () => {
        const root = await loadTestProto();
        const mapper = new ProtoMessageTypeMapper(pbjsStaticModuleRegistry(root));
        const actualFn = () => mapper.map(root.cookiecutter.test);
        expect(actualFn).toThrowError();
    });
});
