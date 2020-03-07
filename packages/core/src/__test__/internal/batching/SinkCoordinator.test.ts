/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Application, cached } from "../../..";
import {
    EventSourcedStateProvider,
    InMemoryStateAggregationSource,
    StaticInputSource,
} from "../../../defaults";
import {
    ErrorHandlingMode,
    IDispatchContext,
    IMessage,
    IOutputSink,
    IPublishedMessage,
    IStateVerification,
    IStoredMessage,
    OutputSinkConsistencyLevel,
    ParallelismMode,
} from "../../../model";
import { CancelablePromise } from "../../../utils";
import { Increment, TallyAggregator, TallyState } from "../../tally";

function runTestApp(
    {
        store,
        publish,
    }: {
        store?: IOutputSink<IStoredMessage | IStateVerification>;
        publish?: IOutputSink<IPublishedMessage>;
    },
    input: IMessage[],
    dispatchTarget: any
): CancelablePromise<void> {
    return Application.create()
        .input()
        .add(new StaticInputSource(input))
        .done()
        .state(
            cached(
                TallyState,
                new EventSourcedStateProvider(
                    TallyState,
                    new TallyAggregator(),
                    new InMemoryStateAggregationSource(new Map())
                )
            )
        )
        .dispatch(dispatchTarget)
        .if(store !== undefined, (app) => app.output().stored(store))
        .if(publish !== undefined, (app) => app.output().published(publish))
        .run(ErrorHandlingMode.LogAndFail, ParallelismMode.Concurrent);
}

describe("SinkCoordinator", () => {
    describe("Atomic Store Sink", () => {
        it("invokes sink once for multiple outputs to different key", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.Atomic,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            await runTestApp(
                { store },
                [
                    { type: "Test", payload: {} },
                    { type: "Test", payload: {} },
                ],
                {
                    onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                        const state1 = await ctx.state.get("some-key");
                        ctx.store(Increment, state1, new Increment(1));
                        ctx.store(Increment, state1, new Increment(2));

                        const state2 = await ctx.state.get("other-key");
                        ctx.store(Increment, state2, new Increment(3));
                        ctx.store(Increment, state2, new Increment(4));
                    },
                }
            );

            expect(store.sink).toHaveBeenCalledTimes(1);
        });

        it("invokes sink once for multiple outputs to same key", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.Atomic,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            await runTestApp(
                { store },
                [
                    { type: "Test", payload: {} },
                    { type: "Test", payload: {} },
                ],
                {
                    onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                        const state = await ctx.state.get("some-key");
                        ctx.store(Increment, state, new Increment(1));
                        ctx.store(Increment, state, new Increment(2));
                    },
                }
            );

            expect(store.sink).toHaveBeenCalledTimes(1);
        });
    });

    describe("Atomic Per Partition Store Sink", () => {
        it("invokes sink multiple times for outputs to different key", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.AtomicPerPartition,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            await runTestApp(
                { store },
                [
                    { type: "Test", payload: {} },
                    { type: "Test", payload: {} },
                ],
                {
                    onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                        const state1 = await ctx.state.get("some-key");
                        ctx.store(Increment, state1, new Increment(1));
                        ctx.store(Increment, state1, new Increment(2));

                        const state2 = await ctx.state.get("other-key");
                        ctx.store(Increment, state2, new Increment(3));
                        ctx.store(Increment, state2, new Increment(4));
                    },
                }
            );

            expect(store.sink).toHaveBeenCalledTimes(4);
        });

        it("invokes sink once for multiple outputs to same key", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.AtomicPerPartition,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            await runTestApp(
                { store },
                [
                    { type: "Test", payload: {} },
                    { type: "Test", payload: {} },
                ],
                {
                    onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                        const state = await ctx.state.get("some-key");
                        ctx.store(Increment, state, new Increment(1));
                        ctx.store(Increment, state, new Increment(2));
                    },
                }
            );

            expect(store.sink).toHaveBeenCalledTimes(1);
        });
    });

    describe("Atomic Store + Publish Sinks", () => {
        it("publishes what was stored successfully", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.Atomic,
                    idempotent: false,
                },
                sink: jest.fn(
                    async (items: IterableIterator<IStoredMessage | IStateVerification>) => {
                        for (const item of items) {
                            if (item.state.key === "bad-key") {
                                throw new Error("don't like that key");
                            }
                        }
                    }
                ),
            };

            const publish: IOutputSink<IPublishedMessage> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.Atomic,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            try {
                await runTestApp(
                    { store, publish },
                    [
                        { type: "Test", payload: { key: "some-key", value: 1 } },
                        { type: "Test", payload: { key: "bad-key", value: 2 } },
                    ],
                    {
                        onTest: async (msg: any, ctx: IDispatchContext<TallyState>) => {
                            const state = await ctx.state.get(msg.key);
                            ctx.store(Increment, state, new Increment(msg.value));
                            ctx.publish(Increment, new Increment(msg.value));
                        },
                    }
                );
            } catch (e) {
                // expected to fail due to bad-key
            }

            // 1st call => for both inputs (will fail)
            // 2nd call => for first input only (will succeed)
            // 3rd call => for second input only (will fail)
            expect(store.sink).toHaveBeenCalledTimes(3);

            // for first input only
            expect(publish.sink).toHaveBeenCalledTimes(1);
            const call = (publish.sink as any).mock.calls[0];
            const items: IPublishedMessage[] = Array.from(call[0]);
            expect(items.length).toBe(1);
            expect(items).toMatchObject([
                {
                    message: {
                        payload: new Increment(1),
                    },
                },
            ]);
        });
    });

    describe("Non-Atomic Store Sink", () => {
        it("invokes sink once for multiple outputs to different key", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.None,
                    idempotent: false,
                },
                sink: jest.fn(),
            };

            await runTestApp(
                { store },
                [
                    { type: "Test", payload: {} },
                    { type: "Test", payload: {} },
                ],
                {
                    onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                        const state1 = await ctx.state.get("some-key");
                        ctx.store(Increment, state1, new Increment(1));
                        const state2 = await ctx.state.get("other-key");
                        ctx.store(Increment, state2, new Increment(3));
                    },
                }
            );

            expect(store.sink).toHaveBeenCalledTimes(1);
        });

        it("does not perform binary search on error", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.None,
                    idempotent: false,
                },
                sink: jest.fn(() => {
                    throw new Error("bad luck");
                }),
            };

            try {
                await runTestApp(
                    { store },
                    [
                        { type: "Test", payload: {} },
                        { type: "Test", payload: {} },
                    ],
                    {
                        onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                            const state1 = await ctx.state.get("some-key");
                            ctx.store(Increment, state1, new Increment(1));
                        },
                    }
                );
            } catch (e) {
                // this is expected to fail
            }

            expect(store.sink).toHaveBeenCalledTimes(1);
        });
    });
});
