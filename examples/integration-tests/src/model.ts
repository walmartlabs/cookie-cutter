/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as proto from "./tally";

export import IRequest = proto.samples.IRequest;
export import Request = proto.samples.Request;
export import IResponse = proto.samples.IResponse;
export import Response = proto.samples.Response;
import { IGrpcServiceDefinition } from "@walmartlabs/cookie-cutter-grpc";

export const TallyServiceDef: IGrpcServiceDefinition = {
    changeTally: {
        path: "/samples/ChangeTally",
        requestType: proto.samples.Request,
        responseType: proto.samples.Response,
        requestStream: false,
        responseStream: false,
    },
};

export class Increment {
    public constructor(public readonly amount: number) {}
}

export class Decrement {
    public constructor(public readonly amount: number) {}
}

export class TallyState {
    public total: number;

    public constructor(snapshot?: { total: number }) {
        this.total = (snapshot && snapshot.total) || 0;
    }

    public snap(): { total: number } {
        return { total: this.total };
    }
}

export class TallyAggregator {
    public onIncrement(msg: Increment, state: TallyState): void {
        state.total += msg.amount;
    }

    public onDecrement(msg: Decrement, state: TallyState): void {
        state.total -= msg.amount;
    }
}
