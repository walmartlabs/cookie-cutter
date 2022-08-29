/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    BoundedPriorityQueue,
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IInputSource,
    ILogger,
    IMessage,
    IMetrics,
    IRequireInitialization,
    MessageRef,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import {
    sendUnaryData,
    Server,
    ServerCredentials,
    ServerErrorResponse,
    ServerUnaryCall,
    ServerWritableStream,
    setLogger,
    status,
} from "@grpc/grpc-js";
import { FORMAT_HTTP_HEADERS, Tags, Tracer } from "opentracing";
import { performance } from "perf_hooks";
import { isError } from "util";
import {
    convertOperationPath,
    createGrpcConfiguration,
    createServiceDefinition,
    GrpcResponseStream,
    GrpcStreamHandler,
} from ".";
import { GrpcMetadata, IGrpcConfiguration, IGrpcServerConfiguration } from "..";
import { GrpcOpenTracingTagKeys } from "./helper";

enum GrpcMetrics {
    RequestReceived = "cookie_cutter.grpc_server.request_received",
    RequestProcessed = "cookie_cutter.grpc_server.request_processed",
    RequestProcessingTime = "cookie_cutter.grpc_server.request_processing_time",
}
enum GrpcMetricResult {
    Success = "success",
    Error = "error",
}

export class GrpcInputSource implements IInputSource, IRequireInitialization {
    private readonly server: Server;
    private readonly queue: BoundedPriorityQueue<MessageRef>;
    private readonly streamHandler: GrpcStreamHandler;
    private logger: ILogger;
    private tracer: Tracer;
    private metrics: IMetrics;

    constructor(private readonly config: IGrpcServerConfiguration & IGrpcConfiguration) {
        if (!config.skipNoStreamingValidation) {
            for (const def of config.definitions) {
                for (const key of Object.keys(def)) {
                    const method = def[key];
                    if (method.requestStream) {
                        throw new Error(
                            "client-side streaming gRPC services are not supported, please consider implementing a this as an input source."
                        );
                    }
                }
            }
        }

        this.streamHandler = new GrpcStreamHandler();
        this.server = new Server(createGrpcConfiguration(config));
        this.queue = new BoundedPriorityQueue<MessageRef>(100);
        this.logger = DefaultComponentContext.logger;
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        const logger: Partial<Console> = {
            error(...args: string[]): void {
                context.logger.info(args.join("; "));
            },
        };
        setLogger(logger as Console);
        this.logger = context.logger;
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        await this.streamHandler.initialize(context);
        await new Promise<void>(async (resolve, reject) => {
            this.server.bindAsync(
                `${this.config.host}:${this.config.port}`,
                ServerCredentials.createInsecure(),
                (error: Error | null, _: number) => {
                    if (error) {
                        this.logger.error(
                            `Call to bindAsync for ${this.config.host}:${this.config.port} returned error: `,
                            error
                        );
                        reject(error);
                    }
                    resolve();
                }
            );
        });

        for (const def of this.config.definitions) {
            const spec = createServiceDefinition(def);
            const impl = {};
            for (const key of Object.keys(def)) {
                const method = def[key];
                if (method.requestStream) {
                    impl[key] = () => {
                        throw Error("not implemented");
                    };
                    continue;
                }

                const type = convertOperationPath(method.path);
                impl[key] = async (...args: any[]) => {
                    const startTime = performance.now();
                    const call: ServerUnaryCall<any, any> | ServerWritableStream<any, any> =
                        args[0];
                    const msg: IMessage = {
                        payload: call.request,
                        type,
                    };

                    function isStreaming(_: any): _ is ServerWritableStream<any, any> {
                        return method.responseStream;
                    }

                    const meta = {
                        [GrpcMetadata.OperationPath]: method.path,
                        [GrpcMetadata.Peer]: call.getPeer(),
                    };

                    if (isStreaming(call)) {
                        const stream = new GrpcResponseStream(call);
                        meta[GrpcMetadata.ResponseStream] = stream;
                        this.streamHandler.addStream(stream);
                    }

                    this.metrics.increment(GrpcMetrics.RequestReceived, {
                        path: method.path,
                    });
                    const metadata = call.metadata.getMap();
                    const spanContext = this.tracer.extract(FORMAT_HTTP_HEADERS, metadata);
                    const span = this.tracer.startSpan("Grpc Server Processing", {
                        childOf: spanContext,
                    });
                    span.log({ isStreaming: isStreaming(call) });
                    span.setTag(Tags.SAMPLING_PRIORITY, 1);
                    span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_SERVER);
                    span.setTag(Tags.COMPONENT, "cookie-cutter-grpc");
                    span.setTag(OpenTracingTagKeys.RpcCall, method.path);
                    span.setTag(OpenTracingTagKeys.RpcHost, this.config.host);
                    span.setTag(OpenTracingTagKeys.RpcPort, this.config.port);
                    span.setTag(OpenTracingTagKeys.RpcFlavor, "grpc");
                    span.setTag(GrpcOpenTracingTagKeys.ProtoType, type);

                    const msgRef = new MessageRef(meta, msg, span.context());
                    msgRef.once("released", async (_, value, error): Promise<void> => {
                        if (error) {
                            failSpan(span, error);
                        }
                        span.finish();
                        if (!isStreaming(call)) {
                            if (isError(value)) {
                                error = value;
                                value = undefined;
                            }

                            const callback: sendUnaryData<any> = args[1];
                            if (value !== undefined) {
                                callback(undefined, value);
                            } else if (error !== undefined) {
                                callback(this.createError(error), null);
                            } else {
                                callback(
                                    this.createError("not implemented", status.UNIMPLEMENTED),
                                    null
                                );
                            }
                        }
                        this.metrics.increment(GrpcMetrics.RequestProcessed, {
                            path: method.path,
                            result: error ? GrpcMetricResult.Error : GrpcMetricResult.Success,
                        });
                        const currentPerformanceTime = performance.now();
                        const runTime = (currentPerformanceTime - startTime) / 1000;
                        this.metrics.timing(GrpcMetrics.RequestProcessingTime, runTime, {
                            path: method.path,
                        });
                    });

                    if (!(await this.queue.enqueue(msgRef))) {
                        await msgRef.release(undefined, new Error("service unavailable"));
                    }
                };
            }
            this.server.addService(spec, impl);
        }
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.server.start();
        for await (const msg of this.queue.iterate()) {
            yield msg;
        }
    }

    public async stop(): Promise<void> {
        this.queue.close();
    }

    public async dispose(): Promise<void> {
        await this.streamHandler.dispose();
        await new Promise<void>(async (resolve) => {
            this.server.tryShutdown((error?: Error) => {
                if (error) {
                    this.logger.warn("gRPC server failed to shutdown gracefully, forcing shutdown");
                    this.server.forceShutdown();
                }
                resolve();
            });
        });
    }

    private createError(error: any, code?: status): ServerErrorResponse {
        return {
            name: error.toString(),
            code: code || status.UNKNOWN,
            message: error.toString(),
        };
    }
}
