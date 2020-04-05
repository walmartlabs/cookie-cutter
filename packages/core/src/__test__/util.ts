/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    cached,
    CapturingOutputSink,
    ErrorHandlingMode,
    EventSourcedStateProvider,
    IClassType,
    IMessage,
    InMemoryStateAggregationSource,
    InMemoryStateOutputSink,
    IPublishedMessage,
    IState,
    ParallelismMode,
    StaticInputSource,
    InMemoryMaterializedViewStateProvider,
    InMemoryMaterializedViewStateOutputSink,
} from "..";

export async function runStatefulApp<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IClassType<TState>,
    aggregator: any,
    streams: Map<string, IMessage[]>,
    input: IMessage[],
    dispatchTarget: any,
    mode: ParallelismMode,
    errorMode: ErrorHandlingMode = ErrorHandlingMode.LogAndFail
): Promise<IMessage[]> {
    const capture: IPublishedMessage[] = [];

    await Application.create()
        .input()
        .add(new StaticInputSource(input))
        .done()
        .dispatch(dispatchTarget)
        .state(
            cached(
                TState,
                new EventSourcedStateProvider(
                    TState,
                    aggregator,
                    new InMemoryStateAggregationSource(streams)
                )
            )
        )
        .output()
        .published(new CapturingOutputSink(capture))
        .stored(new InMemoryStateOutputSink(streams))
        .done()
        .run({
            parallelism: {
                mode,
                concurrencyConfiguration: {
                    batchLingerIntervalMs: 5,
                },
            },
            dispatch: {
                mode: errorMode,
            },
            sink: {
                mode: errorMode,
            },
        });

    return capture.map((m) => m.message);
}

export async function runMaterializedStatefulApp<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IClassType<TState>,
    streams: Map<string, { seqNum: number; data: TSnapshot }>,
    input: IMessage[],
    dispatchTarget: any,
    mode: ParallelismMode,
    errorMode: ErrorHandlingMode = ErrorHandlingMode.LogAndFail
): Promise<IMessage[]> {
    const capture: IPublishedMessage[] = [];

    await Application.create()
        .input()
        .add(new StaticInputSource(input))
        .done()
        .dispatch(dispatchTarget)
        .state(cached(TState, new InMemoryMaterializedViewStateProvider(TState, streams)))
        .output()
        .published(new CapturingOutputSink(capture))
        .stored(new InMemoryMaterializedViewStateOutputSink(streams))
        .done()
        .run({
            parallelism: {
                mode,
                concurrencyConfiguration: {
                    batchLingerIntervalMs: 5,
                },
            },
            dispatch: {
                mode: errorMode,
            },
            sink: {
                mode: errorMode,
            },
        });

    return capture.map((m) => m.message);
}

export async function runStatelessApp(
    input: IMessage[],
    dispatchTarget: any,
    mode: ParallelismMode
): Promise<IMessage[]> {
    const capture: IPublishedMessage[] = [];

    await Application.create()
        .input()
        .add(new StaticInputSource(input))
        .done()
        .dispatch(dispatchTarget)
        .output()
        .published(new CapturingOutputSink(capture))
        .done()
        .run({
            parallelism: {
                mode,
                concurrencyConfiguration: {
                    batchLingerIntervalMs: 5,
                },
            },
            dispatch: {
                mode: ErrorHandlingMode.LogAndFail,
            },
            sink: {
                mode: ErrorHandlingMode.LogAndFail,
            },
        });

    return capture.map((m) => m.message);
}
