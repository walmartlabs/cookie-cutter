/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { CsvMessageEncoder } from "../../defaults";
import { Increment } from "../tally";

describe("CsvMessageEncoder", () => {
    const headers = ["col1", "col2", "col3"];
    const delimiter = "|";
    const typeName = Increment.name;
    const payload = {
        col1: "val1",
        col2: "val2",
        col3: "val3",
    };

    it("encodes", () => {
        const encoder = new CsvMessageEncoder(headers, delimiter, typeName);
        // encodes with all header values available
        const buffer = encoder.encode({
            type: Increment.name,
            payload,
        });
        expect(Buffer.from(buffer).toString()).toBe("val1|val2|val3");

        // encodes with a single missing header value
        const missingHeaderBuffer = encoder.encode({
            type: Increment.name,
            payload: {
                col1: "val1",
                col3: "val3",
            },
        });
        expect(Buffer.from(missingHeaderBuffer).toString()).toBe("val1||val3");

        // encodes with a single header value
        const singleHeaderVal = encoder.encode({
            type: Increment.name,
            payload: { col2: "val2" },
        });
        expect(Buffer.from(singleHeaderVal).toString()).toBe("|val2|");

        // encodes with a no header value found
        const noHeaderVal = encoder.encode({
            type: Increment.name,
            payload: { col4: "val4" },
        });
        expect(Buffer.from(noHeaderVal).toString()).toBe("||");

        // encodes with a header val containing empty columns
        const altEncoder = new CsvMessageEncoder(["col1", "", "col3"], delimiter, typeName);
        const altBuffer = altEncoder.encode({
            type: Increment.name,
            payload,
        });
        expect(Buffer.from(altBuffer).toString()).toBe("val1||val3");
    });

    it("decodes", () => {
        const encoder = new CsvMessageEncoder(headers, delimiter, typeName);
        // decodes with all header values available
        const obj = encoder.decode(
            encoder.encode({
                type: Increment.name,
                payload,
            })
        );

        expect(obj).toMatchObject({
            type: Increment.name,
            payload,
        });

        // decodes with a single missing header value
        const missingValObj = encoder.decode(
            encoder.encode({
                type: Increment.name,
                payload: {
                    col1: "val1",
                    col3: "val3",
                },
            })
        );

        expect(missingValObj).toMatchObject({
            type: Increment.name,
            payload: {
                col1: "val1",
                col3: "val3",
            },
        });

        // decodes with a no header value found
        const noValObj = encoder.decode(
            encoder.encode({
                type: Increment.name,
                payload: {
                    col4: "val4",
                },
            })
        );

        expect(noValObj).toMatchObject({
            type: Increment.name,
            payload: {},
        });

        // check decoder throws error when value contains more header columns than expected
        const incompatibleEncoder = new CsvMessageEncoder(
            ["col1", "col2", "col3", "col4"],
            delimiter,
            typeName
        );
        expect(() => {
            encoder.decode(
                incompatibleEncoder.encode({
                    type: Increment.name,
                    payload: {
                        col1: "val1",
                        col2: "val2",
                        col3: "val3",
                        col4: "val4",
                    },
                })
            );
        }).toThrow();

        // decodes with a header val containing empty columns
        const altEncoder = new CsvMessageEncoder(["col1", "", "col3"], delimiter, typeName);
        const altObj = altEncoder.decode(
            altEncoder.encode({
                type: Increment.name,
                payload,
            })
        );
        expect(altObj).toMatchObject({
            type: Increment.name,
            payload: {
                col1: "val1",
                col3: "val3",
            },
        });
    });
});
