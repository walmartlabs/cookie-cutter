/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    IApplicationBuilder,
    IMessage,
    mockState,
    msg,
    runIntegrationTest,
} from "@walmartlabs/cookie-cutter-core";
import { grpcMsg } from "@walmartlabs/cookie-cutter-grpc";
import { Handler } from "./handler";
import { Increment, TallyAggregator, TallyServiceDef, TallyState } from "./model";

function createTestApp(initial: { [key: string]: IMessage[] }): IApplicationBuilder {
    return Application.create()
        .state(mockState(TallyState, new TallyAggregator(), initial))
        .dispatch(new Handler());
}

describe("gRPC endpoint", () => {
    it("returns new tally", async () => {
        const id = "tally-1";
        const initialState = {
            [id]: [msg(Increment, new Increment(5))],
        };

        const input = [grpcMsg(TallyServiceDef.changeTally, { id, delta: 9 })];

        const result = await runIntegrationTest(createTestApp(initialState), input);
        expect(result.responses).toMatchObject([{ newTotal: 5 + 9 }]);
    });
});

describe("Storage", () => {
    it("stores correct event", async () => {
        const id = "tally-1";
        const initialState = {
            [id]: [msg(Increment, new Increment(5))],
        };

        const input = [grpcMsg(TallyServiceDef.changeTally, { id, delta: 9 })];

        const result = await runIntegrationTest(createTestApp(initialState), input);
        expect(result.outputs).toMatchObject([msg(Increment, new Increment(9))]);
    });
});
