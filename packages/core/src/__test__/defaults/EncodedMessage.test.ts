/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { CsvMessageEncoder, EncodedMessage, NullMessageEncoder } from "../../defaults";
import { Increment } from "../tally";

describe("EncodedMessage", () => {
    it("returns the decoded message as payload", () => {
        const encoder = new NullMessageEncoder();
        const data = Buffer.from("test");
        const msg = new EncodedMessage(encoder, "test_type", data);
        expect(msg.payload).toMatchObject(data);
    });

    it("eagerly decodes the payload if no type is present", () => {
        const headers = ["col1", "col2", "col3"];
        const delimiter = "|";
        const typeName = Increment.name;
        const encoder = new CsvMessageEncoder(headers, delimiter, typeName);
        const data = Buffer.from("val1|val2|val3");
        const msg = new EncodedMessage(encoder, "", data);
        expect(msg).toMatchObject({
            type: typeName,
            payload: {
                col1: "val1",
                col2: "val2",
                col3: "val3",
            },
        });
    });

    it("returns an already decoded message as payload without decoding twice", () => {
        const encoder = new NullMessageEncoder();
        const spy = jest.spyOn(encoder, "decode");
        const data = Buffer.from("test");
        const msg = new EncodedMessage(encoder, "test_type", data);
        const payloads = [msg.payload, msg.payload];
        expect(payloads).toMatchObject([data, data]);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
