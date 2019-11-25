/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    NullLogger,
    NullMetrics,
    NullStateProvider,
    ObjectNameMessageTypeMapper,
} from "../../defaults";
import { BufferedDispatchContext, ServiceRegistry } from "../../internal";
import { MessageRef, SequenceConflictError } from "../../model";

describe("SequenceConflictError", () => {
    it("serializes to JSON without context", () => {
        const context = new BufferedDispatchContext(
            new MessageRef({}, { type: "test", payload: {} }),
            new NullMetrics(),
            new NullLogger(),
            new NullStateProvider(),
            null,
            null,
            new ObjectNameMessageTypeMapper(),
            new ServiceRegistry()
        );
        const error = new SequenceConflictError(
            {
                actualSn: 3,
                expectedSn: 1,
                key: "key-1",
                newSn: 2,
            },
            context
        );

        const json = JSON.stringify(error);
        expect(json).not.toContain('"context"');
    });
});
