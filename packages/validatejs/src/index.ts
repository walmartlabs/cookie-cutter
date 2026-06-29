/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.

DEPRECATED: This module is deprecated and no longer maintained. The underlying
validate.js library contains a known Regular Expression Denial of Service (ReDoS)
vulnerability (CVE-2020-26308) with no available patches. Consider migrating to
a modern validation library such as:
- Zod (https://zod.dev)
- Joi (https://joi.dev)
- yup (https://github.com/jquense/yup)
*/

import {
    IMessage,
    IMessageValidator,
    IValidateResult,
    prettyEventName,
} from "@walmartlabs/cookie-cutter-core";
import * as validate from "validate.js";

export const required = {
    presence: true,
    length(value: any) {
        if (validate.isString(value)) {
            return { minimum: 1, message: "cannot be an empty strings" };
        }
        return null;
    },
};

class ValidateJsMessageValidator implements IMessageValidator {
    private readonly constraints = new Map<string, any>();
    private validateJS: any;

    constructor(constraintsModule: any) {
        for (const item of Object.getOwnPropertyNames(constraintsModule)) {
            if (item.endsWith("Constraint")) {
                const key = item.substr(0, item.indexOf("Constraint"));
                this.constraints.set(key, constraintsModule[item]);
            }
        }
        validate.validators.presence.message = "is required";
        this.validateJS = validate;
    }

    public validate(msg: IMessage): IValidateResult {
        const key = prettyEventName(msg.type);
        const constraint = this.constraints.get(key);
        if (constraint) {
            const result = this.validateJS.validate(msg.payload, constraint);
            if (result) {
                let message = "";
                Object.keys(result).forEach((field: string) => {
                    for (const val of result[field]) {
                        message += `${field}: ${val}\n`;
                    }
                });
                return { success: false, message };
            }
        }

        return { success: true };
    }
}

export function withValidateJs(constraints: any): IMessageValidator {
    console.warn(
        "[DEPRECATED] @walmartlabs/cookie-cutter-validatejs is deprecated. " +
        "The underlying validate.js library contains CVE-2020-26308 (ReDoS vulnerability) " +
        "with no available patches. Please migrate to a modern validation library such as Zod, Joi, or yup."
    );
    return new ValidateJsMessageValidator(constraints);
}
