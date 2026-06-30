/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

/**
 * Replacement for deprecated Node.js util module type checking functions.
 * These functions were removed in newer versions of Node.js.
 */

export function isArray(obj: any): obj is any[] {
    return Array.isArray(obj);
}

export function isBoolean(obj: any): obj is boolean {
    return typeof obj === "boolean";
}

export function isDate(obj: any): obj is Date {
    return obj instanceof Date;
}

export function isError(obj: any): obj is Error {
    return obj instanceof Error;
}

export function isFunction(obj: any): obj is Function {
    return typeof obj === "function";
}

export function isNullOrUndefined(obj: any): obj is null | undefined {
    return obj === null || obj === undefined;
}

export function isNumber(obj: any): obj is number {
    return typeof obj === "number";
}

export function isObject(obj: any): obj is Record<string, any> {
    return obj !== null && typeof obj === "object" && !Array.isArray(obj);
}

export function isString(obj: any): obj is string {
    return typeof obj === "string";
}
