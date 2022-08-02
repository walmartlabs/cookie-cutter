/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as k8s from "@kubernetes/client-node";
import {
    IComponentContext,
    IInputSource,
    IRequireInitialization,
    Lifecycle,
    makeLifecycle,
    MessageRef,
    sleep,
    timeout,
} from "@walmartlabs/cookie-cutter-core";
import * as _ from "lodash";
import * as request from "request";
import { IK8sQueryProvider, IK8sWatchConfiguration, IWatchQueryParams } from ".";
import { KubernetesBase } from "./KubernetesBaseSource";

interface IK8sMessage {
    key: string;
    item: any;
    phase: any;
    msgRef: MessageRef;
}

export class KubernetesPollSource
    extends KubernetesBase
    implements IInputSource, IRequireInitialization
{
    private running: boolean = false;
    private queryProvider: Lifecycle<IK8sQueryProvider>;
    private queryPath: string;
    private queryParams: IWatchQueryParams;
    private reconnectTimeout: number;
    private pollCache: Map<string, any>;

    constructor(private readonly config: IK8sWatchConfiguration) {
        super();
        this.queryPath = config.queryPath;
        this.queryParams = config.queryParams;
        this.reconnectTimeout = config.reconnectTimeout;
        this.pollCache = new Map();

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
        this.running = true;

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

        while (this.running) {
            this.logger.debug(`Starting poll watch`, {
                queryPath: this.queryPath,
                queryParams: this.queryParams,
                reconnectTimeout: this.reconnectTimeout,
                cachedKeys: [...this.pollCache.keys()],
            });
            const k8sMsgs: IK8sMessage[] = [];
            try {
                const pollResponse: any = await timeout(
                    this.poll(kubeConfig, this.queryPath, this.queryParams),
                    this.reconnectTimeout
                );
                const returnedItems = new Set();
                let items = [];
                if (pollResponse.items && pollResponse.items.length > 0) {
                    items = pollResponse.items;
                } else {
                    items.push(pollResponse);
                }

                for (const item of items) {
                    // all queries that return a result with resources will have metadata.uid set
                    const key = item.metadata && item.metadata.uid ? item.metadata.uid : undefined;
                    const msg: IK8sMessage = { key, item, msgRef: undefined, phase: undefined };
                    if (key) {
                        const cachedItem = this.pollCache.get(key);
                        if (cachedItem && !_.isEqual(cachedItem, item)) {
                            msg.msgRef = this.createMsgRef("MODIFIED", item);
                            msg.phase = "MODIFIED";
                        } else {
                            msg.msgRef = this.createMsgRef("ADDED", item);
                            msg.phase = "ADDED";
                        }
                    }
                    if (msg.msgRef) {
                        k8sMsgs.push(msg);
                        returnedItems.add(msg.key);
                    }
                }

                const keysToDelete = [];
                this.pollCache.forEach((item, key) => {
                    if (!returnedItems.has(key)) {
                        keysToDelete.push([key, item]);
                    }
                });

                for (const [key, item] of keysToDelete) {
                    k8sMsgs.push({
                        key,
                        item,
                        msgRef: this.createMsgRef("DELETED", item),
                        phase: "DELETED",
                    });
                }
            } catch (err) {
                this.logger.error(`Unable to get poll results`, err, {
                    queryPath: this.queryPath,
                    queryParams: this.queryParams,
                    reconnectTimeout: this.reconnectTimeout,
                });
                continue;
            }

            for (const msg of k8sMsgs) {
                yield msg.msgRef;
                if (msg.phase === "DELETED") {
                    this.pollCache.delete(msg.key);
                } else {
                    this.pollCache.set(msg.key, msg.item);
                }

                if (!this.running) {
                    break;
                }
            }

            this.logger.debug(`Finished poll watch`, {
                queryPath: this.queryPath,
                queryParams: this.queryParams,
                reconnectTimeout: this.reconnectTimeout,
                cachedKeys: [...this.pollCache.keys()],
            });
            const nextPoll = Date.now() + this.reconnectTimeout;
            while (Date.now() < nextPoll && this.running) {
                await sleep(100);
            }
        }
    }

    public poll(kubeConfig: k8s.KubeConfig, path: string, queryParams: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const cluster = kubeConfig.getCurrentCluster();
            if (!cluster) {
                throw new Error("No currently active cluster");
            }
            const url = cluster.server + path;

            const headerParams: any = {};

            const requestOptions: request.Options = {
                method: "GET",
                qs: queryParams,
                headers: headerParams,
                uri: url,
                useQuerystring: true,
                json: true,
            };
            kubeConfig
                .applyToRequest(requestOptions)
                .then(() => {
                    request(requestOptions, (error, response, body) => {
                        if (error) {
                            reject(error);
                        } else if (response && response.statusCode !== 200) {
                            reject(new Error(response.statusMessage));
                        } else {
                            resolve(body);
                        }
                    });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    public async stop(): Promise<void> {
        this.running = false;
    }

    public async dispose(): Promise<void> {
        await this.queryProvider.dispose();
    }
}
