/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ObjectNameMessageTypeMapper } from "../..";

class MyTestClass {
    public number: number;
}

describe("ObjectNameMessageTypeMapper", () => {
    it("returns a class' name", () => {
        const mapper = new ObjectNameMessageTypeMapper();
        expect(mapper.map(MyTestClass)).toBe("MyTestClass");
    });
});
