/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Tracer } from "opentracing";
import { BufferedDispatchContext } from "..";
import {
    IInputSource,
    ILogger,
    IMessageDispatcher,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IMessageTypeMapper,
    IMessageValidator,
    IMetrics,
    IOutputSink,
    IServiceRegistry,
    IStateCacheLifecycle,
    IStateProvider,
} from "../..";
import { IRequireInitialization } from "../../model";
import { IRetrier } from "../../utils";

export interface IMessageProcessorConfiguration {
    readonly logger: ILogger;
    readonly metrics: IMetrics;
    readonly tracer: Tracer;
    readonly dispatcher: IMessageDispatcher;
    readonly validator: IMessageValidator;
    readonly stateProvider: IStateProvider<any> & IStateCacheLifecycle<any>;
    readonly messageTypeMapper: IMessageTypeMapper;
}

export interface IMessageProcessor extends IRequireInitialization {
    run(
        source: IInputSource,
        inputMessageMetricAnnotator: IMessageMetricAnnotator,
        sink: IOutputSink<BufferedDispatchContext>,
        outputMessageEnricher: IMessageEnricher,
        serviceDiscovery: IServiceRegistry,
        dispatchRetrier: IRetrier,
        sinkRetrier: IRetrier
    ): Promise<void>;
}
