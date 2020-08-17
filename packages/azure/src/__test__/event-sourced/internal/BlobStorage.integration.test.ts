// /*
// Copyright (c) Walmart Inc.

// This source code is licensed under the Apache 2.0 license found in the
// LICENSE file in the root directory of this source tree.
// */

// import {
//     Application,
//     EventSourcedMetadata,
//     IDispatchContext,
//     JsonMessageEncoder,
//     MessageRef,
//     StaticInputSource,
// } from "@walmartlabs/cookie-cutter-core";
// import { EventSourced, ICosmosConfiguration, Materialized, Streaming } from "..";
// import { cosmosDeduper } from "../event-sourced";
// import { CosmosClient } from "../utils";

// class InputMessage {
//     constructor(public readonly value: string) {}
// }

// class State {
//     public value: string | undefined;

//     constructor(snapshot: any) {
//         if (snapshot) {
//             this.value = snapshot.value;
//         }
//     }

//     public snap(): any {
//         return { value: this.value };
//     }
// }

// function msg(streamId: string, sn: number): MessageRef {
//     return new MessageRef(
//         {
//             [EventSourcedMetadata.Stream]: streamId,
//             [EventSourcedMetadata.SequenceNumber]: sn,
//         },
//         {
//             type: InputMessage.name,
//             payload: new InputMessage(`hello ${streamId}@${sn}`),
//         }
//     );
// }

// const COSMOS_CONFIG: ICosmosConfiguration = {
//     collectionId: "data",
//     databaseId: "test-cookie-cutter",
//     encoder: new JsonMessageEncoder(),
//     url: "https://localhost:8081",
//     key: process.env.COSMOS_SECRET_KEY_DEFAULT,
// };

// describe("Message Deduplication for Streaming", () => {
//     const STREAM_1 = `stream-${Date.now()}`;
//     const STREAM_2 = `stream-${Date.now() + 1}`;

//     const TEST_DATA: MessageRef[] = [
//         msg(STREAM_1, 1),
//         msg(STREAM_1, 2),
//         msg(STREAM_1, 3),
//         msg(STREAM_2, 1),
//         msg(STREAM_1, 2), // a dupe
//         msg(STREAM_2, 2),
//     ];

//     it("handles each message exactly once", async () => {
//         for (let i = 0; i < 2; i++) {
//             await Application.create()
//                 .input()
//                 .add(new StaticInputSource(TEST_DATA))
//                 .dedupe(cosmosDeduper(COSMOS_CONFIG))
//                 .done()
//                 .dispatch({
//                     onInputMessage(msg: InputMessage, ctx: IDispatchContext) {
//                         ctx.publish(InputMessage, msg, {
//                             key: ctx.metadata<string>(EventSourcedMetadata.Stream),
//                         });
//                     },
//                 })
//                 .output()
//                 .published(Streaming.cosmosSink(COSMOS_CONFIG))
//                 .done()
//                 .run();
//         }

//         const client = new CosmosClient(COSMOS_CONFIG);
//         const data = await client.query(undefined, {
//             query: "SELECT * FROM c WHERE c.stream_id=@s1 OR c.stream_id=@s2",
//             parameters: [
//                 { name: "@s1", value: STREAM_1 },
//                 { name: "@s2", value: STREAM_2 },
//             ],
//         });

//         expect(data.length).toBe(TEST_DATA.length - 1);
//     });
// });
