/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import k8s = require("@kubernetes/client-node");
import {
    BoundedPriorityQueue,
    IComponentContext,
    IInputSource,
    IRequireInitialization,
    Lifecycle,
    makeLifecycle,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { IK8sQueryProvider, IK8sWatchConfiguration, IWatchQueryParams } from ".";
import { KubernetesBase } from "./KubernetesBaseSource";

interface IK8sRequest {
    abort(): void;
}

export class KubernetesWatchSource
    extends KubernetesBase
    implements IInputSource, IRequireInitialization
{
    private readonly queue: BoundedPriorityQueue<MessageRef>;
    private pendingRequest: IK8sRequest | undefined;
    private done: boolean;
    private queryProvider: Lifecycle<IK8sQueryProvider>;
    private queryPath: string;
    private queryParams: IWatchQueryParams;
    private reconnectTimeout: number;

    constructor(private readonly config: IK8sWatchConfiguration) {
        super();
        this.queue = new BoundedPriorityQueue<MessageRef>(100);
        this.pendingRequest = undefined;
        this.done = false;
        this.queryPath = config.queryPath;
        this.queryParams = config.queryParams;
        this.reconnectTimeout = config.reconnectTimeout;

        if (config.queryProvider) {
            this.queryProvider = makeLifecycle(config.queryProvider);
        }
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this.logger = ctx.logger;
        this.tracer = ctx.tracer;
        this.metrics = ctx.metrics;

        await this.queryProvider.initialize(ctx);
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

    private startWatch(kubeConfig: k8s.KubeConfig) {
        if (this.done) {
            return;
        }

        this.logger.debug(`Starting watch`, {
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
                this.logger.debug(resp, {
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
