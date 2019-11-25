/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
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
    private validateJS: validate.ValidateJS;

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
    return new ValidateJsMessageValidator(constraints);
}
