/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessageDeduper } from "../model";

export class NullMessageDeduper implements IMessageDeduper {
    public isDupe(): Promise<{ dupe: boolean }> {
        return Promise.resolve({ dupe: false });
    }
}
