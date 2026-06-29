/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { isObject } from "@walmartlabs/cookie-cutter-core";
import { IProtoMessageEncoder, IProtoMessageEncoderRegistry } from ".";

export function createRegistry(
    items: IterableIterator<[IProtoMessageEncoder, string]>,
    version?: string
): IProtoMessageEncoderRegistry {
    // IProtoMessageEncoder.fullName -> namespace
    const fromEncoder = new Map<string, string>();
    const toEncoder = new Map<string, IProtoMessageEncoder>();

    if (!version) {
        version = "0.0.0";
    }
    for (const item of items) {
        fromEncoder.set(item[0].fullName, item[1]);
        toEncoder.set(item[1], item[0]);
    }
    return {
        version,
        fromEncoder: (type: IProtoMessageEncoder): string => {
            const name = fromEncoder.get(type.fullName);
            if (name === undefined) {
                throw new Error(
                    `cannot find type name of encoder '${type.name}' for current version '${version}'`
                );
            }
            return name;
        },
        toEncoder: (name: string): IProtoMessageEncoder => {
            const encoder = toEncoder.get(name);
            if (encoder === undefined) {
                throw new Error(
                    `cannot find encoder for type name '${name}' for current version '${version}'`
                );
            }

            return encoder;
        },
    };
}

function isFullNameWritable(value: any, ns: string): boolean {
    // Check if fullName is already set to the correct value (v7 Type instances have this)
    if (value.fullName === ns) {
        return false;
    }

    // Check if the property descriptor allows writing by walking the prototype chain
    let obj = value;
    while (obj) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, "fullName");
        if (descriptor) {
            // If we found a descriptor, check if it's writable
            // Getters without setters are read-only
            return descriptor.writable !== false && !descriptor.get;
        }
        obj = Object.getPrototypeOf(obj);
    }

    // If no descriptor found, it's writable
    return true;
}

function isMessageType(value: any): boolean {
    return value.encode !== undefined;
}

function processModuleKey(
    key: string,
    value: any,
    namespace: string,
    stack: Array<{ obj: any; namespace: string }>,
    results: Array<[IProtoMessageEncoder, string]>
): void {
    if (key === "google") {
        return;
    }

    const ns = (namespace && `${namespace}.${key}`) || key;

    if (isMessageType(value)) {
        // For v7 protobufjs Type instances, fullName is already set and read-only
        // For static-module generated code, we need to set it
        if (isFullNameWritable(value, ns)) {
            value.fullName = ns;
        }
        results.push([value, ns]);
    } else {
        stack.push({ obj: value, namespace: ns });
    }
}

export function* analyzeStaticModule(root: any): IterableIterator<[IProtoMessageEncoder, string]> {
    const stack: Array<{ obj: any; namespace: string }> = [{ obj: root, namespace: "" }];
    const results: Array<[IProtoMessageEncoder, string]> = [];

    while (stack.length > 0) {
        const item = stack.pop();
        if (!isObject(item?.obj)) {
            continue;
        }

        for (const key of Object.keys(item.obj)) {
            const value = item.obj[key];
            processModuleKey(key, value, item.namespace, stack, results);
        }
    }

    yield* results;
}
