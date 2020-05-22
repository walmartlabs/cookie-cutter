/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export class CustomerRegistered {
    public constructor(public userId: string, public name: string) {}
}

export class OrderPlaced {
    public constructor(public userId: string, public amount: number) {}
}
