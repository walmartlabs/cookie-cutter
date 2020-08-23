/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import _ = require("lodash");
import { globalTracer, initGlobalTracer, Tracer } from "opentracing";
import * as path from "path";
import { IMessageProcessor, InputBuilder, LogLevelLoggerDecorator, OutputBuilder } from ".";
import {
    ConventionBasedMessageDispatcher,
    NullLogger,
    NullMessageValidator,
    NullMetrics,
    NullStateProvider,
    NullTracerBuilder,
    ObjectNameMessageTypeMapper,
} from "../defaults";
import {
    ErrorHandlingMode,
    IApplicationBuilder,
    IApplicationRuntimeBehavior,
    IComponentContext,
    IComponentRuntimeBehavior,
    IDisposable,
    IInputBuilder,
    IInputSource,
    ILogger,
    IMessageDispatcher,
    IMessageMetricAnnotator,
    IMessageTypeMapper,
    IMessageValidator,
    IMetrics,
    IOutputBuilder,
    IServiceRegistryBuilder,
    isMessageDispatcher,
    IStateCacheLifecycle,
    IStateProvider,
    ITracerBuilder,
    ITracingBuilder,
    Lifecycle,
    LogLevel,
    makeLifecycle,
    ParallelismMode,
    RetryMode,
} from "../model";
import { CancelablePromise, createRetrier, getRootProjectPackageInfo, timeout } from "../utils";
import { dumpOpenHandles, isUnderTest } from "./helpers";
import {
    createConcurrentMessageProcessor,
    createRpcMessageProcessor,
    createSerialMessageProcessor,
    IMessageProcessorConfiguration,
} from "./processor";
import { ServiceRegistryBuilder } from "./ServiceRegistryBuilder";
import { TracingBuilder } from "./TracingBuilder";
import { EpochStateProvider } from "./EpochStateProvider";

export class ApplicationBuilder implements IApplicationBuilder {
    private inputBuilder: InputBuilder;
    private outputBuilder: OutputBuilder;
    private tracingBuilder: TracingBuilder;
    private serviceRegistryBuilder: ServiceRegistryBuilder;
    private dispatcher: IMessageDispatcher;
    private validator: IMessageValidator;
    private activeMetrics: IMetrics;
    private traceBuilder: ITracerBuilder;
    private activeLogger: ILogger;
    private stateProvider: IStateProvider<any>;
    private messageTypeMapper: IMessageTypeMapper;

    constructor() {
        this.inputBuilder = new InputBuilder(this);
        this.outputBuilder = new OutputBuilder(this);
        this.serviceRegistryBuilder = new ServiceRegistryBuilder(this);
        this.dispatcher = new ConventionBasedMessageDispatcher({});
        this.validator = new NullMessageValidator();
        this.activeMetrics = new NullMetrics();
        this.traceBuilder = new NullTracerBuilder();
        this.tracingBuilder = new TracingBuilder(this);
        this.activeLogger = new NullLogger();
        this.stateProvider = new NullStateProvider();
        this.messageTypeMapper = new ObjectNameMessageTypeMapper();
    }

    public run(
        behaviorOrErrorHandling?: IApplicationRuntimeBehavior | ErrorHandlingMode,
        parallelism?: ParallelismMode
    ): CancelablePromise<void> {
        const source = this.inputBuilder.build();
        const promise: any = this.internalRun(source, behaviorOrErrorHandling, parallelism);
        promise.cancel = async () => {
            try {
                await source.stop();
            } catch (e) {
                this.activeLogger.error("Failed to cancel application", e);
            }
        };

        return promise;
    }

    private async internalRun(
        source: Lifecycle<IInputSource> & IMessageMetricAnnotator,
        behaviorOrErrorHandling?: IApplicationRuntimeBehavior | ErrorHandlingMode,
        parallelism?: ParallelismMode
    ): Promise<void> {
        process.on("unhandledRejection", (err) => {
            this.activeLogger.error("UNHANDLED PROMISE REJECTION, TERMINATING", err);
            process.exit(-1);
        });

        process.on("uncaughtException", (err) => {
            this.activeLogger.error("UNHANDLED EXCEPTION, TERMINATING", err);
            process.exit(-1);
        });

        const rootPackageInfo = getRootProjectPackageInfo();
        const ownPackageInfo = require(path.join(__dirname, "..", "..", "package.json"));
        this.activeLogger.info("starting Cookie Cutter service", {
            version: ownPackageInfo.version,
            serviceName: rootPackageInfo.name,
            serviceVersion: rootPackageInfo.version,
        });

        const sink = this.outputBuilder.build();
        const serviceRegistry = this.serviceRegistryBuilder.build();
        const appBehavior = this.determineRuntimeBehavior(behaviorOrErrorHandling, parallelism);

        let state: Lifecycle<IStateProvider<any> & IStateCacheLifecycle<any>>;
        if (this.isStateCacheLifecycle(this.stateProvider)) {
            if (
                this.outputBuilder.hasStoreSink &&
                appBehavior.parallelism.mode === ParallelismMode.Rpc
            ) {
                state = new EpochStateProvider(this.outputBuilder.epochs, this.stateProvider);
            } else {
                state = makeLifecycle(this.stateProvider);
            }
        } else {
            if (
                this.outputBuilder.hasStoreSink &&
                appBehavior.parallelism.mode === ParallelismMode.Concurrent
            ) {
                throw new Error(
                    "state provider does not support caching, therefore this application can only be run in serial/rpc mode."
                );
            }
            state = makeLifecycle(this.stateProvider) as any;
            state.invalidate = () => {
                // nothing;
            };
            state.set = () => {
                // nothing;
            };
        }

        let processorFunc: (
            config: IMessageProcessorConfiguration
        ) => IMessageProcessor | undefined;
        switch (appBehavior.parallelism.mode) {
            case ParallelismMode.Concurrent:
                processorFunc = (config) =>
                    createConcurrentMessageProcessor(
                        appBehavior.parallelism.concurrencyConfiguration,
                        config
                    );
                break;
            case ParallelismMode.Rpc:
                processorFunc = (config) =>
                    createRpcMessageProcessor(
                        appBehavior.parallelism.concurrencyConfiguration,
                        config
                    );
                break;
            default:
                processorFunc = createSerialMessageProcessor;
        }

        let tracer: Tracer;
        const traceBuilder = makeLifecycle(this.traceBuilder);
        const tracingBuilder = makeLifecycle(this.tracingBuilder);
        const metrics = makeLifecycle(this.activeMetrics);
        const dispatchRetrier = createRetrier(
            appBehavior.dispatch as Required<IComponentRuntimeBehavior>
        );
        const sinkRetrier = createRetrier(appBehavior.sink as Required<IComponentRuntimeBehavior>);
        let successfulInit = true;
        try {
            if (tracingBuilder.hasTracer) {
                await tracingBuilder.initialize({
                    metrics,
                    logger: this.activeLogger,
                    tracer,
                });
                initGlobalTracer(tracingBuilder.build());
            } else {
                await traceBuilder.initialize({
                    metrics,
                    logger: this.activeLogger,
                    tracer,
                });
                initGlobalTracer(traceBuilder.create());
            }
            tracer = globalTracer();

            const dispatchContext: IComponentContext = {
                metrics,
                logger: this.activeLogger,
                tracer,
            };
            const sinkContext: IComponentContext = {
                metrics,
                logger: this.activeLogger,
                tracer,
            };
            const sourceContext: IComponentContext = {
                metrics,
                logger: this.activeLogger,
                tracer,
            };
            await metrics.initialize(sourceContext);
            await state.initialize(dispatchContext);
            await sink.initialize(sinkContext);
            await source.initialize(sourceContext);
            await serviceRegistry.initialize(dispatchContext);
        } catch (e) {
            successfulInit = false;
            this.activeLogger.error("failed to initialize component", e);
        }

        const processor = processorFunc({
            dispatcher: this.dispatcher,
            logger: this.activeLogger,
            messageTypeMapper: this.messageTypeMapper,
            metrics,
            tracer,
            stateProvider: state,
            validator: this.validator,
        });

        try {
            await processor.initialize({
                metrics,
                logger: this.activeLogger,
                tracer,
            });
        } catch (e) {
            successfulInit = false;
            this.activeLogger.error("failed to initialize message processor", e);
        }

        let successfulRun = false;
        if (successfulInit) {
            let signalCounter = 0;
            const interrupted = new Promise((_, reject) => {
                process.on("SIGINT", async () => {
                    this.activeLogger.info("shutdown requested");
                    signalCounter++;
                    if (signalCounter > 1) {
                        dumpOpenHandles(this.activeLogger);
                        if (!isUnderTest()) {
                            this.activeLogger.warn("terminating process");
                            process.exit(1);
                        }
                    } else {
                        await source.stop();
                        try {
                            await timeout(done, 5000);
                        } catch (e) {
                            dumpOpenHandles(this.activeLogger);
                            reject(
                                new Error(
                                    "timeout for graceful shutdown expired, forcefully terminating"
                                )
                            );
                        }
                    }
                });
            });
            const done = processor.run(
                source,
                source,
                sink,
                sink,
                serviceRegistry,
                dispatchRetrier,
                sinkRetrier
            );

            try {
                await Promise.race([done, interrupted]);
                successfulRun = true;
            } catch (e) {
                this.activeLogger.error("event processor terminated unexpectedly", e);
                try {
                    await source.stop();
                } catch (e) {
                    this.activeLogger.error("failed to stop input source", e);
                }
            }
        }

        const tryDispose = async (obj: IDisposable): Promise<boolean> => {
            try {
                await obj.dispose();
            } catch (e) {
                this.activeLogger.error("failed to dispose component", e);
                return false;
            }

            return true;
        };

        this.activeLogger.info("shutting down");
        const successfulDispose =
            (await tryDispose(source)) &&
            (await tryDispose(sink)) &&
            (await tryDispose(serviceRegistry)) &&
            (await tryDispose(state)) &&
            (await tryDispose(metrics)) &&
            (await tryDispose(traceBuilder)) &&
            (await tryDispose(tracingBuilder));

        if (!successfulInit || !successfulDispose || !successfulRun) {
            if (!isUnderTest()) {
                process.exitCode = 1;
            } else {
                throw new Error(
                    `test failed: init: ${successfulInit}, run: ${successfulRun}, dispose: ${successfulDispose}`
                );
            }
        }

        if (!isUnderTest()) {
            setTimeout(() => {
                this.activeLogger.warn("application is hanging, forcefully terminating");
                dumpOpenHandles(this.activeLogger);
                process.exit(1);
            }, 1000).unref();
        }
    }

    public typeMapper(mapper: IMessageTypeMapper): IApplicationBuilder {
        this.messageTypeMapper = mapper;
        return this;
    }

    public if(predicate: boolean, action: (app: IApplicationBuilder) => void): IApplicationBuilder {
        if (predicate) {
            action(this);
        }
        return this;
    }

    public validate(validator: IMessageValidator): IApplicationBuilder {
        this.validator = validator;
        return this;
    }

    public metrics(metrics: IMetrics): IApplicationBuilder {
        this.activeMetrics = metrics;
        return this;
    }

    public tracer(traceBuilder: ITracerBuilder): IApplicationBuilder {
        this.traceBuilder = traceBuilder;
        return this;
    }

    public tracing(): ITracingBuilder {
        return this.tracingBuilder;
    }

    public logger(logger: ILogger, level?: LogLevel): IApplicationBuilder {
        if (level !== undefined) {
            this.activeLogger = new LogLevelLoggerDecorator(logger, level);
        } else {
            this.activeLogger = logger;
        }
        return this;
    }

    public state<TState, T extends IStateProvider<TState>>(provider: T): IApplicationBuilder {
        this.stateProvider = provider;
        return this;
    }

    public input(): IInputBuilder {
        return this.inputBuilder;
    }

    public dispatch(targetOrDispatcher: any): IApplicationBuilder {
        if (isMessageDispatcher(targetOrDispatcher)) {
            this.dispatcher = targetOrDispatcher;
        } else {
            this.dispatcher = new ConventionBasedMessageDispatcher(targetOrDispatcher);
        }
        return this;
    }

    public output(): IOutputBuilder {
        return this.outputBuilder;
    }

    public services(): IServiceRegistryBuilder {
        return this.serviceRegistryBuilder;
    }

    private determineRuntimeBehavior(
        behaviorOrErrorHandling?: IApplicationRuntimeBehavior | ErrorHandlingMode,
        parallelism?: ParallelismMode
    ): IApplicationRuntimeBehavior {
        const d: IApplicationRuntimeBehavior = {
            dispatch: {
                mode: ErrorHandlingMode.LogAndRetry,
                maxRetryIntervalMs: 30000,
                retryIntervalMs: 500,
                retryMode: RetryMode.Exponential,
                exponentBase: 2,
                randomize: false,
                retries: Infinity,
            },
            sink: {
                mode: ErrorHandlingMode.LogAndRetry,
                maxRetryIntervalMs: 30000,
                retryIntervalMs: 500,
                retryMode: RetryMode.Exponential,
                exponentBase: 2,
                randomize: false,
                retries: Infinity,
            },
            parallelism: {
                mode: ParallelismMode.Concurrent,
                concurrencyConfiguration: {
                    batchLingerIntervalMs: 50,
                    emitMetricsForBatches: true,
                    emitMetricsForQueues: true,
                    inputQueueCapacity: 5000,
                    maximumBatchSize: 1000,
                    minimumBatchSize: 50,
                    outputQueueCapacity: 5000,
                    queueMetricsIntervalMs: 1000,
                    yieldForIOMessageCount: 100,
                    maximumParallelRpcRequests: 500,
                },
            },
        };

        behaviorOrErrorHandling = behaviorOrErrorHandling || ErrorHandlingMode.LogAndRetryOrFail;
        let result: IApplicationRuntimeBehavior;
        if (this.isApplicationRuntimeBehavior(behaviorOrErrorHandling)) {
            result = {
                dispatch: {
                    ...d.dispatch,
                    ...behaviorOrErrorHandling.dispatch,
                },
                sink: {
                    ...d.sink,
                    ...behaviorOrErrorHandling.sink,
                },
                parallelism: {
                    mode: parallelism || d.parallelism.mode,
                    ...behaviorOrErrorHandling.parallelism,
                },
            };
        } else {
            const mode: ErrorHandlingMode = behaviorOrErrorHandling;
            let retries = Infinity;
            if (
                mode === ErrorHandlingMode.LogAndRetryOrContinue ||
                mode === ErrorHandlingMode.LogAndRetryOrFail
            ) {
                retries = 5;
            } else if (
                mode === ErrorHandlingMode.LogAndContinue ||
                mode === ErrorHandlingMode.LogAndFail
            ) {
                retries = 0;
            }
            result = {
                dispatch: {
                    ...d.dispatch,
                    mode,
                    retries,
                },
                sink: {
                    ...d.sink,
                    mode,
                    retries,
                },
                parallelism: {
                    ...d.parallelism,
                    mode: parallelism || d.parallelism.mode,
                },
            };
        }

        return _.merge({}, d, result);
    }

    private isApplicationRuntimeBehavior(obj: any): obj is IApplicationRuntimeBehavior {
        return obj.dispatch !== undefined && obj.sink !== undefined;
    }

    private isStateCacheLifecycle(obj: any): obj is IStateCacheLifecycle<any> {
        return obj.invalidate !== undefined && obj.set !== undefined;
    }
}
