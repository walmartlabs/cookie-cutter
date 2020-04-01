/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

const mockLogError: jest.Mock = jest.fn();
import {
    Application,
    ErrorHandlingMode,
    IDispatchContext,
    IMessage,
    ParallelismMode,
    sleep,
    StaticInputSource,
    waitForPendingIO,
} from "..";
import { CapturingOutputSink } from "../defaults";
import {
    IApplicationRuntimeBehavior,
    IInputSource,
    IMessageValidator,
    IMetricTags,
    IOutputSink,
    IPublishedMessage,
    IStateVerification,
    IStoredMessage,
    IValidateResult,
    MessageProcessingMetrics,
    MessageProcessingResults,
    MessageRef,
    OutputSinkConsistencyLevel,
    SequenceConflictError,
    StateRef,
} from "../model";
import { Future } from "../utils";
import { dec, Decrement, inc, Increment, TallyAggregator, TallyState } from "./tally";
import { runStatefulApp, runStatelessApp, runMaterializedStatefulApp } from "./util";

for (const mode of [ParallelismMode.Serial, ParallelismMode.Concurrent, ParallelismMode.Rpc]) {
    describe(`Application in ${ParallelismMode[mode]} mode`, () => {
        it("routes all published messages to output sink", async () => {
            const input: IMessage[] = [inc(4), inc(7)];

            const published = await runStatelessApp(
                input,
                {
                    onIncrement: (msg: Increment, ctx: IDispatchContext): void => {
                        ctx.publish(Decrement, new Decrement(msg.count + 1));
                    },
                },
                mode
            );

            expect(published).toMatchObject([dec(5), dec(8)]);
        });

        it("clears messages from buffered context in case of dispatch handler error", async () => {
            const input: IMessage[] = [inc(4)];

            const streams = new Map<string, IMessage[]>();
            const output = await runStatefulApp(
                TallyState,
                new TallyAggregator(),
                streams,
                input,
                {
                    onIncrement: async (
                        msg: Increment,
                        ctx: IDispatchContext<TallyState>
                    ): Promise<void> => {
                        const stateRef = await ctx.state.get("tally-1");
                        ctx.store(Increment, stateRef, new Increment(msg.count));
                        ctx.publish(Decrement, new Decrement(msg.count + 1));
                        throw new Error("onIncrement error");
                    },
                },
                mode,
                ErrorHandlingMode.LogAndContinue
            );
            expect(output).toHaveLength(0);
            expect(streams.size).toBe(0);
        });

        it("throws an error when calling publish/store after the completion of a dispatch context", async () => {
            const streams = new Map<string, IMessage[]>();
            let publishPromise: Promise<void>;
            let storePromise: Promise<void>;
            async function delayedPromise(ctx: IDispatchContext, state: any): Promise<void> {
                await sleep(500);
                if (state) {
                    ctx.store(Increment, state, new Increment(1));
                    return;
                }
                ctx.publish(Decrement, new Decrement(1));
            }

            const dispatchTarget = {
                onIncrement: async (
                    _: Increment,
                    ctx: IDispatchContext<TallyState>
                ): Promise<void> => {
                    const stateRef = await ctx.state.get("tally-1");
                    publishPromise = delayedPromise(ctx, undefined);
                    storePromise = delayedPromise(ctx, stateRef);
                },
            };

            await runStatefulApp(
                TallyState,
                new TallyAggregator(),
                streams,
                [inc(1)],
                dispatchTarget,
                mode,
                ErrorHandlingMode.LogAndContinue
            );
            await expect(publishPromise).rejects.toEqual(
                new Error(
                    "Buffered Dispatch Context was already completed. Unable to call publish after completion."
                )
            );
            await expect(storePromise).rejects.toEqual(
                new Error(
                    "Buffered Dispatch Context was already completed. Unable to call store after completion."
                )
            );
        });

        it("terminates gracefully with multiple inputs", async () => {
            let tally = 0;
            await Application.create()
                .input()
                .add(
                    new StaticInputSource([
                        { type: Increment.name, payload: new Increment(1) },
                        { type: Increment.name, payload: new Increment(2) },
                    ])
                )
                .add(
                    new StaticInputSource([
                        { type: Decrement.name, payload: new Decrement(1) },
                        { type: Decrement.name, payload: new Decrement(1) },
                    ])
                )
                .done()
                .dispatch({
                    onIncrement: (msg: Increment) => {
                        tally += msg.count;
                    },
                    onDecrement: (msg: Decrement) => {
                        tally -= msg.count;
                    },
                })
                .run(ErrorHandlingMode.LogAndFail, mode);

            expect(tally).toBe(1);
        });

        it("successfully terminates gracefully for publish sink errors", async () => {
            const publish: IOutputSink<IPublishedMessage> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.None,
                    idempotent: true,
                },
                sink: () => {
                    throw new Error("unable to use publish sink");
                },
            };
            let err: Error;
            try {
                await Application.create()
                    .input()
                    .add(new StaticInputSource([{ type: "Test", payload: {} }]))
                    .done()
                    .dispatch({
                        onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                            ctx.publish(Increment, new Increment(1));
                        },
                    })
                    .output()
                    .published(publish)
                    .done()
                    .run(ErrorHandlingMode.LogAndFail, mode);
            } catch (e) {
                err = e;
            }
            expect(err).toMatchObject(
                new Error(`test failed: init: true, run: false, dispose: true`)
            );
        });

        it("successfully terminates gracefully for store sink errors", async () => {
            const store: IOutputSink<IStoredMessage | IStateVerification> = {
                guarantees: {
                    consistency: OutputSinkConsistencyLevel.Atomic,
                    idempotent: false,
                },
                sink: () => {
                    throw new Error("unable to use store sink");
                },
            };
            let err: Error;
            try {
                await Application.create()
                    .input()
                    .add(new StaticInputSource([{ type: "Test", payload: {} }]))
                    .done()
                    .dispatch({
                        onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                            ctx.store(
                                Increment,
                                new StateRef(new TallyState(), "key1", 1),
                                new Increment(1)
                            );
                        },
                    })
                    .output()
                    .stored(store)
                    .done()
                    .run(ErrorHandlingMode.LogAndFail, mode);
            } catch (e) {
                err = e;
            }
            expect(err).toMatchObject(
                new Error(`test failed: init: true, run: false, dispose: true`)
            );
        });

        it("does not try to annotate metrics for unhandled messages (does not access their payload)", async () => {
            let tally = 0;
            await Application.create()
                .input()
                .add(
                    new StaticInputSource([
                        { type: Decrement.name, payload: new Decrement(1) },
                        { type: Increment.name, payload: new Increment(7) },
                        { type: Increment.name, payload: new Increment(3) },
                        { type: Decrement.name, payload: new Decrement(2) },
                    ])
                )
                // we add in an annotator to ensure we don't create base metric tags
                // if a context wasn't completed
                .annotate({
                    annotate: (input: IMessage): IMetricTags => {
                        if (input.payload.type === Increment.name) {
                            throw new Error("should never reach");
                        } else {
                            return { tag: input.payload.count };
                        }
                    },
                })
                .done()
                .dispatch({
                    onDecrement: (msg: Decrement) => {
                        tally -= msg.count;
                    },
                })
                .run(ErrorHandlingMode.LogAndFail, mode);

            expect(tally).toBe(-3);
        });

        it("correctly routes appropriate message through the invalid message handler", async () => {
            const mockInvalid = jest.fn((msg: IMessage, ctx: IDispatchContext) => {
                const count = (msg.payload as Increment).count;
                if ((msg.payload as Increment).count === 3) {
                    ctx.publish(Increment, new Increment(10 * count));
                } else {
                    ctx.publish(Increment, new Increment(10 * count + 1));
                }
            });
            class MyMessageValidator implements IMessageValidator {
                public validate(msg: IMessage): IValidateResult {
                    if (msg.payload.count % 2 === 0) {
                        return { success: true };
                    } else {
                        return { success: false, message: "failed validate" };
                    }
                }
            }

            let capture: any[] = [];
            await Application.create()
                .validate(new MyMessageValidator())
                .input()
                .add(
                    new StaticInputSource([
                        { type: Increment.name, payload: new Increment(2) },
                        { type: Increment.name, payload: new Increment(3) }, // fails input validation, passes output validation
                        { type: Increment.name, payload: new Increment(4) },
                        { type: Increment.name, payload: new Increment(6) }, // passes input validation, fails output validation
                        { type: Increment.name, payload: new Increment(9) }, // fails input validatin and fails output validation
                    ])
                )
                .done()
                .dispatch({
                    onIncrement: (msg: Increment, ctx: IDispatchContext) => {
                        if (msg.count === 6) {
                            ctx.publish(Increment, new Increment(7));
                        } else {
                            ctx.publish(Increment, msg);
                        }
                    },
                    invalid: mockInvalid,
                })
                .output()
                .published(new CapturingOutputSink(capture))
                .done()
                .run(ErrorHandlingMode.LogAndFail, mode);

            capture = capture.map((m) => m.message);
            expect(capture).toEqual([inc(2), inc(30), inc(4)]);
            expect(mockInvalid).toHaveBeenCalledTimes(2);
            expect(mockInvalid).toHaveBeenNthCalledWith(1, inc(3), expect.any(Object));
            expect(mockInvalid).toHaveBeenNthCalledWith(2, inc(9), expect.any(Object));
        });

        it("successfully proceeds after an invalid input and invalid output messages", async () => {
            const metrics = jest.fn().mockImplementationOnce(() => {
                return {
                    increment: jest.fn(),
                    gauge: jest.fn(),
                    timing: jest.fn(),
                };
            })();
            class MyMessageValidator implements IMessageValidator {
                public validate(msg: IMessage): IValidateResult {
                    if (msg.payload.count % 2 === 0) {
                        return { success: true };
                    } else {
                        return { success: false, message: "failed validate" };
                    }
                }
            }

            let capture: any[] = [];
            await Application.create()
                .metrics(metrics)
                .validate(new MyMessageValidator())
                .input()
                .add(
                    new StaticInputSource([
                        { type: Increment.name, payload: new Increment(2) },
                        { type: Increment.name, payload: new Increment(3) }, // fails input validation
                        { type: Increment.name, payload: new Increment(4) },
                        { type: Increment.name, payload: new Increment(6) }, // fails output validation
                    ])
                )
                .annotate({
                    annotate: (input: IMessage): IMetricTags => {
                        return { tag: input.payload.count };
                    },
                })
                .done()
                .dispatch({
                    onIncrement: (msg: Increment, ctx: IDispatchContext) => {
                        if (msg.count === 6) {
                            ctx.publish(Increment, new Increment(7));
                        } else {
                            ctx.publish(Increment, msg);
                        }
                    },
                })
                .output()
                .published(new CapturingOutputSink(capture))
                .done()
                .run(ErrorHandlingMode.LogAndFail, mode);

            capture = capture.map((m) => m.message);
            expect(capture).toMatchObject([
                { type: Increment.name, payload: new Increment(2) },
                { type: Increment.name, payload: new Increment(4) },
            ]);
            expect(metrics.increment).toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    tag: 3,
                    result: MessageProcessingResults.ErrInvalidMsg,
                })
            );
            expect(metrics.increment).toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    tag: 6,
                    result: MessageProcessingResults.ErrInvalidMsg,
                })
            );
            expect(metrics.increment).not.toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    tag: 3,
                    result: MessageProcessingResults.Success,
                })
            );
            expect(metrics.increment).not.toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    tag: 6,
                    result: MessageProcessingResults.Success,
                })
            );
        });

        it("doesn't record metrics for handlers that throw an error", async () => {
            const metrics = jest.fn().mockImplementationOnce(() => {
                return {
                    increment: jest.fn(),
                    gauge: jest.fn(),
                    timing: jest.fn(),
                };
            })();

            await Application.create()
                .metrics(metrics)
                .input()
                .add(new StaticInputSource([inc(4)]))
                .done()
                .dispatch({
                    onIncrement: async (_: Increment, ctx: IDispatchContext): Promise<void> => {
                        ctx.metrics.increment("increment", 1, { test_tag: 1 });
                        ctx.metrics.gauge("gauge", 1, { test_tag: 1 });
                        ctx.metrics.timing("timing", 1, { test_tag: 1 });
                        throw new Error("onIncrement failed");
                    },
                })
                .run(ErrorHandlingMode.LogAndContinue, mode);

            expect(metrics.increment).not.toHaveBeenCalledWith("increment", 1, { test_tag: 1 });
            expect(metrics.gauge).not.toHaveBeenCalledWith("gauge", 1, { test_tag: 1 });
            expect(metrics.timing).not.toHaveBeenCalledWith("timing", 1, { test_tag: 1 });
        });

        it("records 'processed' metric for all messages", async () => {
            const metrics = jest.fn().mockImplementationOnce(() => {
                return {
                    increment: jest.fn(),
                    gauge: jest.fn(),
                    timing: jest.fn(),
                };
            })();

            await Application.create()
                .metrics(metrics)
                .input()
                .add(new StaticInputSource([inc(4), dec(5)]))
                .done()
                .dispatch({
                    onIncrement: (msg: Increment, ctx: IDispatchContext) => {
                        ctx.publish(Increment, msg);
                    },
                    onDecrement: (msg: Decrement, ctx: IDispatchContext) => {
                        ctx.publish(Decrement, msg);
                    },
                })
                .run(ErrorHandlingMode.LogAndContinue, mode);

            expect(metrics.increment).toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    event_type: Increment.name,
                    result: MessageProcessingResults.Success,
                })
            );

            expect(metrics.increment).toHaveBeenCalledWith(
                MessageProcessingMetrics.Processed,
                expect.objectContaining({
                    event_type: Decrement.name,
                    result: MessageProcessingResults.Success,
                })
            );
        });
    });
}

for (const mode of [ParallelismMode.Concurrent, ParallelismMode.Rpc]) {
    describe(`Application in ${ParallelismMode[mode]} mode`, () => {
        it("does not process evicted messages", async () => {
            const readyToEvict = new Future<void>();

            const source: IInputSource = {
                async *start(ctx) {
                    const evicter = (async () => {
                        await readyToEvict.promise;
                        await ctx.evict((_) => true);
                    })();

                    yield new MessageRef({}, inc(1));
                    yield new MessageRef({}, inc(2));
                    yield new MessageRef({}, inc(3));
                    yield new MessageRef({}, inc(4));

                    await evicter;
                },
                stop: (): Promise<void> => {
                    return Promise.resolve();
                },
            };

            const capture = new Array();
            await Application.create()
                .input()
                .add(source)
                .done()
                .dispatch({
                    onIncrement: async (msg: Increment, ctx: IDispatchContext) => {
                        await sleep(50);
                        ctx.publish(Increment, msg);
                        if (msg.count === 2) {
                            readyToEvict.resolve();
                        }
                    },
                })
                .output()
                .published(new CapturingOutputSink(capture))
                .done()
                .run({
                    dispatch: {
                        mode: ErrorHandlingMode.LogAndFail,
                    },
                    sink: {
                        mode: ErrorHandlingMode.LogAndFail,
                    },
                    parallelism: {
                        mode,
                        concurrencyConfiguration: {
                            maximumParallelRpcRequests: 2,
                        },
                    },
                });

            const published = capture.map((m) => m.message);
            expect(published).toMatchObject([inc(1), inc(2)]);
        });
    });
}

for (const mode of [ParallelismMode.Serial, ParallelismMode.Concurrent]) {
    describe(`Application in ${ParallelismMode[mode]} mode`, () => {
        it("aggregates and persists correct state", async () => {
            const input: IMessage[] = [inc(4), inc(7)];

            const streams = new Map<string, IMessage[]>();
            await runStatefulApp(
                TallyState,
                new TallyAggregator(),
                streams,
                input,
                {
                    onIncrement: async (
                        msg: Increment,
                        ctx: IDispatchContext<TallyState>
                    ): Promise<void> => {
                        const stateRef = await ctx.state.get("tally-1");
                        if (stateRef.state.total === 0) {
                            ctx.store(Increment, stateRef, new Increment(msg.count));
                        } else {
                            // a calculation dependent on the previous state
                            ctx.store(
                                Increment,
                                stateRef,
                                new Increment(msg.count * stateRef.state.total)
                            );
                        }
                    },
                },
                mode
            );

            expect(streams.get("tally-1")).toMatchObject([
                inc(4), // initial value
                inc(28), // 4 * 7 = 28
            ]);
        });

        it("handles sequence number conflicts", async () => {
            const input: IMessage[] = [inc(4), inc(7), inc(2), inc(1)];

            const streams = new Map<string, IMessage[]>();
            const receivedIncs: number[] = [];
            await runStatefulApp(
                TallyState,
                new TallyAggregator(),
                streams,
                input,
                {
                    onIncrement: async (
                        msg: Increment,
                        ctx: IDispatchContext<TallyState>
                    ): Promise<void> => {
                        receivedIncs.push(msg.count);
                        const stateRef = await ctx.state.get("tally-1");
                        if (stateRef.state.total === 0) {
                            ctx.store(Increment, stateRef, new Increment(msg.count));
                        } else {
                            // pretend an event was appended to the event stream
                            // from somewhere outside of this event processor
                            if (stateRef.seqNum === 1) {
                                while (!streams.has("tally-1")) {
                                    await waitForPendingIO();
                                }
                                const stream = streams.get("tally-1");
                                if (stream.length === 1) {
                                    streams.get("tally-1").push(inc(2));
                                }
                            }

                            // a calculation dependent on the previous state
                            ctx.store(
                                Increment,
                                stateRef,
                                new Increment(msg.count * stateRef.state.total)
                            );
                        }
                    },
                },
                mode
            );

            expect(streams.get("tally-1")).toMatchObject([
                inc(4), // initial value
                inc(2), // injected
                inc(42), // (4 + 2) * 7 = 42
                inc(96), // (4 + 2 + 42) * 2 = 96
                inc(144), // (4 + 2 + 42 + 96) * 1 = 144
            ]);
        });

        it("performs sequence conflict check when no new output event is generated", async () => {
            const input: IMessage[] = [inc(4), inc(7), inc(2), inc(1)];

            const streams = new Map<string, IMessage[]>();
            const receivedIncs: number[] = [];
            await runStatefulApp(
                TallyState,
                new TallyAggregator(),
                streams,
                input,
                {
                    onIncrement: async (
                        msg: Increment,
                        ctx: IDispatchContext<TallyState>
                    ): Promise<void> => {
                        receivedIncs.push(msg.count);
                        const stateRef = await ctx.state.get("tally-1");
                        if (stateRef.state.total === 0) {
                            ctx.store(Increment, stateRef, new Increment(msg.count));
                        } else {
                            // pretend an event was appended to the event stream
                            // from somewhere outside of this event processor
                            if (stateRef.seqNum === 1) {
                                while (!streams.has("tally-1")) {
                                    await waitForPendingIO();
                                }
                                const stream = streams.get("tally-1");
                                if (stream.length === 1) {
                                    streams.get("tally-1").push(inc(2));
                                }

                                // don't store anything, we still expect to receive a sequence conflict
                                // as we based the decision not to store a new event based on a stale state
                            } else {
                                ctx.store(
                                    Increment,
                                    stateRef,
                                    new Increment(msg.count * stateRef.state.total)
                                );
                            }
                        }
                    },
                },
                mode
            );

            expect(streams.get("tally-1")).toMatchObject([
                inc(4), // initial value
                inc(2), // injected
                inc(42), // (4 + 2) * 7 = 42
                inc(96), // (4 + 2 + 42) * 2 = 96
                inc(144), // (4 + 2 + 42 + 96) * 1 = 144
            ]);
        });
    });
}

for (const mode of [ParallelismMode.Rpc]) {
    describe(`Application in ${ParallelismMode[mode]} mode`, () => {
        it("does not execute message handlers sequentially", async () => {
            const input: IMessage[] = [inc(4), inc(7)];

            const published = await runStatelessApp(
                input,
                {
                    onIncrement: async (msg: Increment, ctx: IDispatchContext): Promise<void> => {
                        // delay first message so 2nd msg can pass by
                        if (msg.count === 4) {
                            await sleep(50);
                        }
                        ctx.publish(Decrement, new Decrement(msg.count + 1));
                    },
                },
                mode
            );

            expect(published).toMatchObject([dec(8), dec(5)]);
        });

        it("handles many messages in parallel", async () => {
            const input: IMessage[] = [];
            for (let i = 1; i < 5000; i++) {
                input.push(inc(i));
            }

            const published = await runStatelessApp(
                input,
                {
                    onIncrement: async (msg: Increment, ctx: IDispatchContext): Promise<void> => {
                        // ensure number of pending requests keeps growing
                        await sleep(5);
                        ctx.publish(Decrement, new Decrement(msg.count + 1));
                    },
                },
                mode
            );

            const unique = new Set<number>(published.map((p) => p.payload.count));
            expect(unique.size).toBe(input.length);
        });

        it("computes correct state when conflicting messages are handled in parallel", async () => {
            const input: IMessage[] = [];
            for (let i = 1; i < 15; i++) {
                input.push(inc(i));
            }

            const expected = input.reduce((p, c) => p + c.payload.count, 0);

            const streams = new Map();
            await runMaterializedStatefulApp(
                TallyState,
                streams,
                input,
                {
                    onIncrement: async (msg: Increment, ctx: IDispatchContext<TallyState>) => {
                        const stateRef = await ctx.state.get("state-1");
                        stateRef.state.total += msg.count;
                        ctx.store(TallyState, stateRef, stateRef.state.snap());

                        // sleep for a few messages to provoke an epoch conflict
                        if (msg.count % 7 === 0) {
                            await sleep(msg.count * 2 + 100);
                        }
                    },
                },
                mode,
                ErrorHandlingMode.LogAndFail
            );

            expect(streams.get("state-1").data.total).toBe(expected);
            expect(streams.get("state-1").seqNum).toBe(input.length);
        });

        it("correctly calls the gauge metric for number of items InFlight in RPC mode", async () => {
            const metrics = jest.fn().mockImplementationOnce(() => {
                return {
                    increment: jest.fn(),
                    gauge: jest.fn(),
                    timing: jest.fn(),
                };
            })();

            const queueMetricsIntervalMs = 100;
            const appBehavior: IApplicationRuntimeBehavior = {
                dispatch: {
                    mode: ErrorHandlingMode.LogAndContinue,
                },
                sink: {
                    mode: ErrorHandlingMode.LogAndContinue,
                },
                parallelism: {
                    mode,
                    concurrencyConfiguration: {
                        queueMetricsIntervalMs,
                    },
                },
            };

            await Application.create()
                .metrics(metrics)
                .input()
                .add(new StaticInputSource([inc(4), inc(5)]))
                .done()
                .dispatch({
                    onIncrement: async (msg: Increment, ctx: IDispatchContext): Promise<void> => {
                        ctx.publish(Decrement, new Decrement(msg.count + 1));
                        await sleep(queueMetricsIntervalMs * 1.1);
                    },
                })
                .run(appBehavior);

            expect(metrics.gauge).toHaveBeenCalledWith(
                MessageProcessingMetrics.ConcurrentHandlers,
                2
            );
        });
    });
}

describe(`Application`, () => {
    it("has access to registered service", async () => {
        const input: IMessage[] = [inc(4)];

        const serviceName = "mockService";
        const callApi = jest.fn();
        const initialize = jest.fn();
        const dispose = jest.fn();
        const service = jest.fn().mockImplementationOnce(() => {
            return {
                callApi,
                initialize,
                dispose,
            };
        });
        const dispatch = {
            onIncrement: async (_: Increment, ctx: IDispatchContext): Promise<void> => {
                const mockService = ctx.services.get<{ callApi(): void }>(serviceName);
                mockService.callApi();
            },
        };
        await Application.create()
            .services()
            .add(serviceName, service())
            .done()
            .input()
            .add(new StaticInputSource(input))
            .done()
            .dispatch(dispatch)
            .run(ErrorHandlingMode.LogAndFail, ParallelismMode.Serial);

        expect(callApi).toHaveBeenCalledTimes(1);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});

async function runApplication(
    source: IInputSource,
    dispatchTarget: any,
    store: IOutputSink<IStoredMessage>,
    capture: IPublishedMessage[],
    appBehavior: IApplicationRuntimeBehavior
): Promise<void> {
    await Application.create()
        .logger({ error: mockLogError, debug: jest.fn(), warn: jest.fn(), info: jest.fn() })
        .input()
        .add(source)
        .done()
        .dispatch(dispatchTarget)
        .output()
        .stored(store)
        .published(new CapturingOutputSink(capture))
        .done()
        .run(appBehavior);
}

const expectLogNthCall = (mockFn: jest.Mock, nth: number, isFinalAttempt: boolean) => {
    expect(mockFn).toHaveBeenNthCalledWith(
        nth,
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
            type: expect.any(String),
            currentAttempt: nth,
            maxAttempts: expect.any(Number),
            finalAttempt: isFinalAttempt,
        })
    );
};
const isFinalAttempt = true;
const notFinalAttempt = false;
for (const mode of [ParallelismMode.Serial, ParallelismMode.Concurrent, ParallelismMode.Rpc]) {
    describe(`Application in ${ParallelismMode[mode]}`, () => {
        const behavior = { mode: ErrorHandlingMode.LogAndRetryOrContinue, retries: 2 };
        const appBehavior = {
            dispatch: { ...behavior },
            parallelism: { mode },
            sink: { ...behavior },
        };
        const store: IOutputSink<IStoredMessage> = {
            guarantees: {
                consistency: OutputSinkConsistencyLevel.Atomic,
                idempotent: false,
            },
            sink: jest.fn(),
        };

        describe("testing ErrorHandlingModes of the Sink Retrier", () => {
            let counter: number;
            let source: StaticInputSource;
            let err: Error;
            let capture: IPublishedMessage[];

            const thrownError = new Error("store sink thrown error");
            const bailedError = new Error("store sink bailed error");
            const secConError = new SequenceConflictError({
                actualSn: 1,
                expectedSn: 2,
                key: "test-key",
                newSn: 3,
            });

            const throwSink: jest.Mock = jest.fn().mockImplementation(async () => {
                throw thrownError;
            });
            const bailSink: jest.Mock = jest.fn().mockImplementation(async (_, retry) => {
                retry.bail(bailedError);
            });
            const bailSeqConSink: jest.Mock = jest.fn().mockImplementation(async (_, retry) => {
                if (counter > 0) {
                    return;
                }
                counter++;
                retry.bail(secConError);
            });

            const target = {
                onTest: async (_: any, ctx: IDispatchContext<TallyState>) => {
                    ctx.store(
                        Increment,
                        new StateRef(new TallyState(), "key1", 1),
                        new Increment(1)
                    );
                    ctx.publish(Increment, new Increment(1));
                },
            };

            beforeEach(() => {
                counter = 0;
                source = new StaticInputSource([{ type: "Test", payload: {} }]);
                err = undefined;
                capture = [];
            });

            it("throws inside a LogAndRetryOrFail Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndFail;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrFail;
                store.sink = throwSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(throwSink).toHaveBeenCalledTimes(3);
                expectLogNthCall(mockLogError, 2, notFinalAttempt);
                expectLogNthCall(mockLogError, 3, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toMatchObject(
                    new Error(`test failed: init: true, run: false, dispose: true`)
                );
            });

            it("bails inside a LogAndRetryOrFail Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndFail;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrFail;
                store.sink = bailSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(bailSink).toHaveBeenCalledTimes(1);
                expectLogNthCall(mockLogError, 1, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toMatchObject(
                    new Error(`test failed: init: true, run: false, dispose: true`)
                );
            });

            it("bails with a SequenceConflict inside a LogAndRetryOrFail Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndFail;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrFail;
                store.sink = bailSeqConSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(bailSeqConSink).toHaveBeenCalledTimes(2);
                expect(capture.length).toBe(1);
                expect(err).toBe(undefined);
            });

            it("throws inside a LogAndRetryOrContinue Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndContinue;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrContinue;
                store.sink = throwSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(throwSink).toHaveBeenCalledTimes(3);
                expectLogNthCall(mockLogError, 2, notFinalAttempt);
                expectLogNthCall(mockLogError, 3, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toBe(undefined);
            });

            it("bails inside a LogAndRetryOrContinue Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndContinue;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrContinue;
                store.sink = bailSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(bailSink).toHaveBeenCalledTimes(1);
                expectLogNthCall(mockLogError, 1, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toBe(undefined);
            });

            it("bails with a SequenceConflict inside a LogAndRetryOrContinue Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndContinue;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndRetryOrContinue;
                store.sink = bailSeqConSink;
                try {
                    await runApplication(source, target, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(bailSeqConSink).toHaveBeenCalledTimes(2);
                expect(capture.length).toBe(1);
                expect(err).toBe(undefined);
            });
        });

        describe("testing ErrorHandlingModes of the Dispatch Retrier", () => {
            let source: StaticInputSource;
            let err: Error;
            let capture: IPublishedMessage[];

            store.sink = async () => {
                return;
            };

            const targetThrow = {
                onTest: jest.fn().mockImplementation(async (_: any) => {
                    throw new Error("some error thrown from dispatch");
                }),
            };

            const targetBail = {
                onTest: jest
                    .fn()
                    .mockImplementation(async (_: any, ctx: IDispatchContext<TallyState>) => {
                        ctx.bail(new Error("some bail error from dispatch"));
                    }),
            };

            beforeEach(() => {
                source = new StaticInputSource([{ type: "Test", payload: {} }]);
                err = undefined;
                capture = [];
            });

            it("throws inside a LogAndRetryOrFail Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndRetryOrFail;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndFail;
                try {
                    await runApplication(source, targetThrow, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(targetThrow.onTest).toHaveBeenCalledTimes(3);
                expectLogNthCall(mockLogError, 2, notFinalAttempt);
                expectLogNthCall(mockLogError, 3, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toMatchObject(
                    new Error(`test failed: init: true, run: false, dispose: true`)
                );
            });

            it("bails inside a LogAndRetryOrFail Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndRetryOrFail;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndFail;
                try {
                    await runApplication(source, targetBail, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(targetBail.onTest).toHaveBeenCalledTimes(1);
                expectLogNthCall(mockLogError, 1, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toMatchObject(
                    new Error(`test failed: init: true, run: false, dispose: true`)
                );
            });

            it("throws inside a LogAndRetryOrContinue Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndRetryOrContinue;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndContinue;
                try {
                    await runApplication(source, targetThrow, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(targetThrow.onTest).toHaveBeenCalledTimes(3);
                expectLogNthCall(mockLogError, 2, notFinalAttempt);
                expectLogNthCall(mockLogError, 3, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toBe(undefined);
            });

            it("bails inside a LogAndRetryOrContinue Retrier", async () => {
                appBehavior.dispatch.mode = ErrorHandlingMode.LogAndRetryOrContinue;
                appBehavior.sink.mode = ErrorHandlingMode.LogAndContinue;
                try {
                    await runApplication(source, targetBail, store, capture, appBehavior);
                } catch (e) {
                    err = e;
                }
                expect(targetBail.onTest).toHaveBeenCalledTimes(1);
                expectLogNthCall(mockLogError, 1, isFinalAttempt);
                expect(capture.length).toBe(0);
                expect(err).toBe(undefined);
            });
        });
    });
}
