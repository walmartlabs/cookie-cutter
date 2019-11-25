/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { isObject } from "util";
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

export function* analyzeStaticModule(root: any): IterableIterator<[IProtoMessageEncoder, string]> {
    const stack: [
        {
            obj: any;
            namespace: string;
        }
    ] = [{ obj: root, namespace: "" }];

    while (stack.length > 0) {
        const item = stack.pop();
        if (isObject(item.obj)) {
            for (const key of Object.keys(item.obj)) {
                if (key === "google") {
                    continue;
                }
                const value = item.obj[key];
                const ns = (item.namespace && `${item.namespace}.${key}`) || key;
                if (value.encode !== undefined) {
                    value.fullName = ns;
                    yield [value, ns];
                } else {
                    stack.push({ obj: value, namespace: ns });
                }
            }
        }
    }
}
