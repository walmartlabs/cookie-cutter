/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import { isArray } from "util";
import {
    CapturingOutputSink,
    ErrorHandlingMode,
    EventSourcedStateProvider,
    IAggregableState,
    IApplicationBuilder,
    IClassType,
    IInputSource,
    IMessage,
    IMetadata,
    InMemoryStateAggregationSource,
    IOutputSink,
    IPublishedMessage,
    IState,
    IStateAggregationSource,
    IStateProvider,
    IStateType,
    IStoredMessage,
    MessageRef,
    ParallelismMode,
    StaticInputSource,
    StaticInputSourceType,
} from ".";
import { MaterializedViewStateProvider } from "./defaults/MaterializedViewStateProvider";
import {
    IDispatchContext,
    IMessageDispatcher,
    isStoredMessage,
    IStateVerification,
    StateRef,
} from "./model";

const TRUNCATE_BEACON = "testing.TruncateOutputBeacon";

export interface ITestResult {
    readonly published: IPublishedMessage[];
    readonly stored: IStoredMessage[];
    // IMessages contained in stored + published concatenated
    readonly outputs: IMessage[];
    // values/errors returned from message handlers (e.g. gRPC responses)
    readonly responses: any[];
}

export function mock(values: StaticInputSourceType<IMessage>, stream?: string): IInputSource {
    return new StaticInputSource(values, stream);
}

function capturePublished(target: IPublishedMessage[]): IOutputSink<IPublishedMessage> {
    return new CapturingOutputSink(target);
}

function captureStored(
    target: (IStoredMessage | IStateVerification)[]
): IOutputSink<IStoredMessage | IStateVerification> {
    return new CapturingOutputSink(target);
}

export async function runIntegrationTest(
    builder: IApplicationBuilder,
    inputs: StaticInputSourceType<IMessage | MessageRef>,
    errorHandling?: ErrorHandlingMode,
    parallelism?: ParallelismMode
): Promise<ITestResult> {
    const result1 = new Array<IPublishedMessage>();
    const result2 = new Array<IStoredMessage | IStateVerification>();
    errorHandling = errorHandling || ErrorHandlingMode.LogAndFail;
    parallelism = parallelism || ParallelismMode.Serial;

    const source = new StaticInputSource(inputs, undefined, true);

    // little hacky, makes assumption about internals of builder instance
    const dispatcher: IMessageDispatcher = (builder as any).dispatcher;

    await builder
        .input()
        .add(source)
        .done()
        .dispatch({
            canDispatch: (msg: IMessage): boolean => {
                return msg.type === TRUNCATE_BEACON || dispatcher.canDispatch(msg);
            },
            dispatch: async (msg: IMessage, ctx: IDispatchContext): Promise<void> => {
                if (msg.type === TRUNCATE_BEACON) {
                    result1.length = 0;
                    result2.length = 0;
                    source.responses.length = 0;
                } else {
                    return await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
                }
            },
        })
        .output()
        .published(capturePublished(result1))
        .stored(captureStored(result2))
        .done()
        .run(errorHandling, parallelism);

    process.removeAllListeners();
    const published = result1;
    const stored = result2.filter((m) => isStoredMessage(m)).map((m) => m as IStoredMessage);
    return {
        published,
        stored,
        outputs: published.map((r) => r.message).concat(stored.map((r) => r.message)),
        responses: source.responses,
    };
}

export function msg<T>(type: IClassType<T>, data: T): IMessage;
export function msg<T>(type: IClassType<T>, data: T, meta: IMetadata): MessageRef;
export function msg<T>(type: IClassType<T>, data: T, meta?: IMetadata): IMessage | MessageRef {
    const msg: IMessage = {
        type: type.name,
        payload: data,
    };

    return meta === undefined ? msg : new MessageRef(meta, msg);
}

export function truncateOutputBeacon(): IMessage {
    return {
        type: TRUNCATE_BEACON,
        payload: {},
    };
}

export function mockState<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IStateType<TState, TSnapshot>,
    aggregator: any,
    events: IMessage[] | { [key: string]: IMessage[] }
): IStateProvider<TState> {
    let source: IStateAggregationSource<TSnapshot>;
    if (isArray(events)) {
        source = {
            load(): Promise<IAggregableState<TSnapshot>> {
                const result: IAggregableState<TSnapshot> = {
                    snapshot: undefined,
                    lastSn: events.length,
                    events,
                };
                return Promise.resolve(result);
            },
        };
    } else {
        const storage = new Map<string, IMessage[]>();
        for (const key of Object.keys(events)) {
            storage.set(key, events[key]);
        }
        source = new InMemoryStateAggregationSource(storage);
    }

    return new EventSourcedStateProvider<TState, TSnapshot>(TState, aggregator, source);
}

class MockedMaterializedState<TSnapshot> extends MaterializedViewStateProvider<
    IState<TSnapshot>,
    TSnapshot
> {
    private snapshots: Map<string, IState<TSnapshot>> = new Map();

    public constructor(
        stateType: IStateType<IState<TSnapshot>, TSnapshot>,
        states: { [key: string]: IState<TSnapshot> }
    ) {
        super(stateType);
        for (const key of Object.keys(states)) {
            this.snapshots.set(key, states[key]);
        }
    }

    public async get(
        _spanContext: SpanContext,
        key: string,
        atSn?: number
    ): Promise<StateRef<IState<TSnapshot>>> {
        const test = this.snapshots.get(key);
        return test ? new StateRef(test, key, atSn) : new StateRef(new this.TState(), key, 0);
    }
}

export function mockMaterializedState<TSnapshot>(
    stateType: IStateType<IState<TSnapshot>, TSnapshot>,
    states: { [key: string]: IState<TSnapshot> }
): IStateProvider<IState<TSnapshot>> {
    return new MockedMaterializedState(stateType, states);
}
