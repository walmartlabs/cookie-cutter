/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { EventSourcedMetadata, MessageRef } from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import { ICosmosQuery, ICosmosQueryClient } from "../../..";
import { CosmosMessageDeduper } from "../../../event-sourced/internal";

function mockClient(impl: (query: ICosmosQuery) => any[]): ICosmosQueryClient {
    return {
        query: jest.fn((_: SpanContext, query: ICosmosQuery) => {
            return Promise.resolve(impl(query));
        }),
    };
}

describe("CosmosMessageDeduper", () => {
    for (const item of [
        [1, true],
        [2, true],
        [3, false],
    ]) {
        it("detects message that have already been processed", async () => {
            const client = mockClient(() => [2]);
            const deduper = new CosmosMessageDeduper(client);

            const actual = await deduper.isDupe(
                new MessageRef(
                    {
                        [EventSourcedMetadata.Stream]: "input1",
                        [EventSourcedMetadata.SequenceNumber]: item[0],
                    },
                    null,
                    null
                )
            );

            expect(actual).toMatchObject({ dupe: item[1] });
        });
    }

    it("queries only once per input", async () => {
        const client = mockClient((query: ICosmosQuery) => {
            if (query.parameters[0].value === "input1") {
                return [2];
            } else {
                return [10];
            }
        });
        const deduper = new CosmosMessageDeduper(client);

        await deduper.isDupe(
            new MessageRef(
                {
                    [EventSourcedMetadata.Stream]: "input1",
                    [EventSourcedMetadata.SequenceNumber]: 2,
                },
                null,
                null
            )
        );

        await deduper.isDupe(
            new MessageRef(
                {
                    [EventSourcedMetadata.Stream]: "input1",
                    [EventSourcedMetadata.SequenceNumber]: 3,
                },
                null,
                null
            )
        );

        expect(client.query).toHaveBeenCalledTimes(1);

        await deduper.isDupe(
            new MessageRef(
                {
                    [EventSourcedMetadata.Stream]: "input2",
                    [EventSourcedMetadata.SequenceNumber]: 12,
                },
                null,
                null
            )
        );

        expect(client.query).toHaveBeenCalledTimes(2);
    });

    it("doesn't mark new input streams as dupes", async () => {
        const client = mockClient(() => []);
        const deduper = new CosmosMessageDeduper(client);

        const actual = await deduper.isDupe(
            new MessageRef(
                {
                    [EventSourcedMetadata.Stream]: "input1",
                    [EventSourcedMetadata.SequenceNumber]: 2,
                },
                null,
                null
            )
        );

        expect(actual).toMatchObject({ dupe: false });
    });
});
