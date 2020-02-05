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
    Lifecycle,
    makeLifecycle,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { Span, Tags, Tracer } from "opentracing";
import {
    IK8sQueryProvider,
    IK8sWatchConfiguration,
    IWatchQueryParams,
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
    private queryProvider: Lifecycle<IK8sQueryProvider>;
    private queryPath: string;
    private queryParams: IWatchQueryParams;
    private reconnectTimeout: number;

    constructor(private readonly config: IK8sWatchConfiguration) {
        this.queue = new BoundedPriorityQueue<MessageRef>(100);
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
        this.pendingRequest = undefined;
        this.done = false;
        this.queryPath = config.queryPath;
        this.queryParams = config.queryParams;
        this.reconnectTimeout = config.reconnectTimeout;

        if (config.queryProvider) {
            this.queryProvider = makeLifecycle(config.queryProvider);
        }
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        const kubeConfig = new k8s.KubeConfig();
        if (this.config.configFilePath) {
            kubeConfig.loadFromFile(this.config.configFilePath);
        } else {
            kubeConfig.loadFromDefault();
        }
        if (this.config.currentContext) {
            kubeConfig.setCurrentContext(this.config.currentContext);
        }
        this.currentContext = kubeConfig.getCurrentContext();

        if (this.queryProvider) {
            const client = kubeConfig.makeApiClient(k8s.ApiextensionsV1beta1Api);
            const config = await this.queryProvider.getQueryConfig(client);
            if (config.queryPath) {
                this.queryPath = config.queryPath;
            }
            if (config.queryParams) {
                this.queryParams = config.queryParams;
            }
        }

        this.startWatch(kubeConfig);
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

        await this.queryProvider.initialize(ctx);
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

    private startWatch(kubeConfig: k8s.KubeConfig) {
        if (this.done) {
            return;
        }

        this.logger.info(`Starting watch`, {
            queryPath: this.queryPath,
            queryParams: this.queryParams,
            reconnectTimeout: this.reconnectTimeout,
        });

        const RESTART_MSG = `watch didn't receive any items for ${this.reconnectTimeout}ms`;

        const watch = new k8s.Watch(kubeConfig);
        const watchPromise = new Promise<string>((resolve, reject) => {
            let pendingEnqueue: Promise<boolean>;

            const startTimeout = () => {
                const timer = setTimeout(() => reject(RESTART_MSG), this.reconnectTimeout);
                timer.unref();
                return timer;
            };
            let timeout = startTimeout();

            watch
                .watch(
                    this.queryPath,
                    this.queryParams,
                    (phase: string, obj: any) => {
                        // restart the timeout countdown
                        clearTimeout(timeout);
                        timeout = startTimeout();

                        if (!pendingEnqueue) {
                            const msgRef = this.createMsgRef(phase, obj);
                            if (msgRef) {
                                pendingEnqueue = this.queue.enqueue(msgRef);
                            }
                            return;
                        }

                        const msgRef = this.createMsgRef(phase, obj);
                        if (msgRef) {
                            pendingEnqueue = pendingEnqueue.then(() => this.queue.enqueue(msgRef));
                        }
                    },
                    (err: any) => {
                        clearTimeout(timeout);
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(`k8s watch finished`);
                    }
                )
                .then((req) => {
                    this.pendingRequest = req;
                })
                .catch((err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
        });

        watchPromise.then(
            (resp) => {
                this.logger.info(resp, {
                    queryPath: this.queryPath,
                    queryParams: this.queryParams,
                });
                this.closePendingRequest();
                this.startWatch(kubeConfig);
            },
            (reason) => {
                if (reason === RESTART_MSG) {
                    this.logger.warn(`k8s watch may have failed, restarting`, {
                        queryPath: this.queryPath,
                        queryParams: this.queryParams,
                    });
                } else {
                    this.logger.error(`k8s watch failed`, reason, {
                        queryPath: this.queryPath,
                        queryParams: this.queryParams,
                    });
                }
                this.closePendingRequest();
                this.startWatch(kubeConfig);
            }
        );
    }

    private createMsgRef(phase: string, obj: any): MessageRef | undefined {
        let msg: IMessage | undefined;
        switch (phase) {
            case "ADDED":
                msg = {
                    payload: new K8sResourceAdded(obj),
                    type: K8sResourceAdded.name,
                };
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

            return msgRef;
        }
    }

    private async abort(): Promise<void> {
        this.closePendingRequest();
        await this.queue.close();
    }

    private closePendingRequest(): void {
        if (this.pendingRequest) {
            const pr = this.pendingRequest;
            this.pendingRequest = undefined;
            pr.abort();
        }
    }

    public async dispose(): Promise<void> {
        await this.queryProvider.dispose();
    }
}
