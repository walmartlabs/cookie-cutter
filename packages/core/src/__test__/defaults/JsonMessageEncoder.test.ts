/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { JsonMessageEncoder } from "../../defaults";
import { inc } from "../tally";

describe("JsonMessageEncoder", () => {
    it("encodes", () => {
        const encoder = new JsonMessageEncoder();
        const obj = inc(2);
        const buffer = encoder.encode(obj);

        expect(Buffer.from(buffer).toString()).toBe(`{"count":2}`);
    });

    it("decodes", () => {
        const encoder = new JsonMessageEncoder();
        const obj = encoder.decode(Buffer.from(`{"count":2}`), "Increment");

        expect(obj).toMatchObject(inc(2));
    });
});
