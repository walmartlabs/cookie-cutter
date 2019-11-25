/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { generateUniqueId } from "../../utils";

describe("generateUniqueId", () => {
    it("generates a hash value for an set of strings", async () => {
        const uniqueId = generateUniqueId("val1", "val2");
        expect(uniqueId).toBe("f2a47ef58c1564593e6313924c79f6d4");
    });
    it("generates a hash value for a set of ints", async () => {
        const uniqueId = generateUniqueId(12345, 67890);
        expect(uniqueId).toBe("e807f1fcf82d132f9bb018ca6738a19f");
    });
    it("generates a hash value for a set of booleans", async () => {
        const uniqueId = generateUniqueId(true, true, false);
        expect(uniqueId).toBe("bf0994b3e4a16d2004228bdc3c34d053");
    });
    it("generates a hash value for a set of Dates", async () => {
        const uniqueId = generateUniqueId(new Date(1558633000), new Date(1558630000));
        expect(uniqueId).toBe("d7473f4f0b0176a5e7801dae28996d52");
    });

    it("generates a hash value for a set of various values", async () => {
        const uniqueId = generateUniqueId("val1", 12345, true, new Date(1558633000), [
            "val2",
            67890,
            false,
            new Date(1558630000),
        ]);
        expect(uniqueId).toBe("a21afc31a5e0bbe0407926ebe8b01fe1");
    });

    it("generates the same hash value for the same set of inputs", async () => {
        const id1 = generateUniqueId("val1", 12345, true, new Date(1558633000));
        expect(id1).toBe("18ec27eca7cb303b86f2987434db1ecc");

        const id2 = generateUniqueId("val1", 12345, true, new Date(1558633000));
        expect(id2).toBe("18ec27eca7cb303b86f2987434db1ecc");
    });
});
