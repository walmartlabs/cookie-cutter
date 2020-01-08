/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import k8s = require("@kubernetes/client-node");
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
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";
import {
    IK8sWatchConfiguration,
    K8sResourceAdded,
    K8sResourceDeleted,
    K8sResourceModified,
} from ".";

interface IK8sRequest {
    abort(): void;
}

enum K8OpenTracingTagKeys {
    MessageType = "k8.msg_type",
    MessagePhase = "k8.msg_phase",
}
enum K8Metrics {
    MsgReceived = "cookie_cutter.k8_api_consumer.input_msg_received",
    MsgProcessed = "cookie_cutter.k8_api_consumer.input_msg_processed",
}
enum K8MetricResult {
    Success = "success",
    Error = "error",
}

export class KubernetesWatchSource implements IInputSource, IRequireInitialization {
    private readonly queue: BoundedPriorityQueue<MessageRef>;
    private tracer: Tracer;
    private pendingRequest: IK8sRequest | undefined;
    private done: boolean;
    private logger: ILogger;
    private metrics: IMetrics;
    private currentContext: string | undefined;
    private spanOperationName = "Processing Kubernetes API Message";

    constructor(private readonly config: IK8sWatchConfiguration) {
        this.queue = new BoundedPriorityQueue<MessageRef>(100);
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
        this.pendingRequest = undefined;
        this.done = false;
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.startWatch();
        yield* this.queue.iterate();
    }

    public async stop(): Promise<void> {
        this.done = true;
        await this.abort();
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this.logger = ctx.logger;
        this.tracer = ctx.tracer;
        this.metrics = ctx.metrics;
    }

    private spanLogAndSetTags(span: Span, phase: string, msgType: string): void {
        span.log({ phase, msgType });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_SERVER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-kubernetes");
        span.setTag(Tags.PEER_HOSTNAME, this.currentContext);
        span.setTag(Tags.PEER_SERVICE, "kubernetes");
        span.setTag(K8OpenTracingTagKeys.MessagePhase, phase);
        span.setTag(K8OpenTracingTagKeys.MessageType, msgType);
    }

    private startWatch() {
        if (this.done) {
            return;
        }

        const config = new k8s.KubeConfig();
        if (this.config.configFilePath) {
            config.loadFromFile(this.config.configFilePath);
        } else {
            config.loadFromDefault();
        }
        if (this.config.currentContext) {
            config.setCurrentContext(this.config.currentContext);
        }
        this.currentContext = config.getCurrentContext();

        const watch = new k8s.Watch(config);
        this.pendingRequest = watch.watch(
            this.config.queryPath,
            this.config.queryParams,
            async (phase: string, obj: any) => {
                let msg: IMessage | undefined;
                switch (phase) {
                    case "ADDED":
                        msg = { payload: new K8sResourceAdded(obj), type: K8sResourceAdded.name };
                        break;
                    case "MODIFIED":
                        msg = {
                            payload: new K8sResourceModified(obj),
                            type: K8sResourceModified.name,
                        };
                        break;
                    case "DELETED":
                        msg = {
                            payload: new K8sResourceDeleted(obj),
                            type: K8sResourceDeleted.name,
                        };
                        break;
                    default:
                        this.logger.warn(`unexpected resource phase '${phase}'`);
                }

                if (msg) {
                    this.metrics.increment(K8Metrics.MsgReceived, {
                        event_type: msg.type,
                    });
                    const span = this.tracer.startSpan(this.spanOperationName);
                    this.spanLogAndSetTags(span, phase, msg.type);

                    const msgRef = new MessageRef({}, msg, span.context());
                    msgRef.once("released", async (_, __, error) => {
                        this.metrics.increment(K8Metrics.MsgProcessed, {
                            event_type: _.payload.type,
                            result: error ? K8MetricResult.Error : K8MetricResult.Success,
                        });
                        if (error) {
                            failSpan(span, error);
                        }
                        span.finish();
                    });

                    await this.queue.enqueue(msgRef);
                }
            },
            (err: any) => {
                this.logger.error("k8s watch failed, restarting in 5s", err);
                setTimeout(() => this.startWatch(), 5000).unref();
            }
        );
    }

    private async abort(): Promise<void> {
        if (this.pendingRequest) {
            const pr = this.pendingRequest;
            this.pendingRequest = undefined;
            pr.abort();
        }
        await this.queue.close();
    }
}
