/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { required, withValidateJs } from "..";

describe("Validatejs", () => {
    const validator = withValidateJs({ fieldConstraint: { field: required } });
    it("rejects an undefined parameter value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: undefined },
        });
        expect(result.success).toEqual(false);
        expect(result.message).toEqual("field: Field is required\n");
    });
    it("rejects a null parameter value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: null },
        });
        expect(result.success).toEqual(false);
        expect(result.message).toEqual("field: Field is required\n");
    });
    it("rejects an empty string as parameter value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: "" },
        });
        expect(result.success).toEqual(false);
        expect(result.message).toEqual("field: Field cannot be an empty strings\n");
    });
    it("accepts an empty array as parameter value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: [] },
        });
        expect(result.success).toEqual(true);
    });
    it("accepts an empty object as paramater value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: {} },
        });
        expect(result.success).toEqual(true);
    });
    it("accepts a non-empty string as parameter value", () => {
        const result = validator.validate({
            type: "field",
            payload: { field: " " },
        });
        expect(result.success).toEqual(true);
    });
});
