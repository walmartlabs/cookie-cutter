/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IClassType, IMessageTypeMapper } from "../model";

export class ObjectNameMessageTypeMapper implements IMessageTypeMapper {
    public map<T>(type: IClassType<T>): string {
        return type.name;
    }
}
