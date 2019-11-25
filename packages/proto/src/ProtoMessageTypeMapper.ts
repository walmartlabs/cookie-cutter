/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IClassType, IMessageTypeMapper } from "@walmartlabs/cookie-cutter-core";
import { IProtoMessageEncoder, IProtoMessageEncoderRegistry } from ".";

export class ProtoMessageTypeMapper implements IMessageTypeMapper {
    constructor(private readonly lookup: IProtoMessageEncoderRegistry) {}

    public map<T>(type: IClassType<T>): string {
        return this.lookup.fromEncoder(type as IProtoMessageEncoder);
    }
}
