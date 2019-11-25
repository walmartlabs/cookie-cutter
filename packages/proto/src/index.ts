/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IClassType } from "@walmartlabs/cookie-cutter-core";
import { analyzeStaticModule, createRegistry } from "./pbjs";

export { ProtoMessageEncoder } from "./ProtoMessageEncoder";
export { ProtoJsonMessageEncoder } from "./ProtoJsonMessageEncoder";
export { ProtoMessageTypeMapper } from "./ProtoMessageTypeMapper";

export interface IProtoMessageEncoderRegistry {
    fromEncoder(type: IProtoMessageEncoder): string;
    toEncoder(name: string): IProtoMessageEncoder;
    readonly version: string;
}

export interface IProtoMessageEncoder extends IClassType<any> {
    encode(obj: any): { finish(): Uint8Array };
    decode(data: Uint8Array): any;
    fromObject(obj: any): any;
    readonly fullName: string;
}

export function pbjsStaticModuleRegistry(
    root: any,
    version?: string
): IProtoMessageEncoderRegistry {
    return createRegistry(analyzeStaticModule(root), version);
}
