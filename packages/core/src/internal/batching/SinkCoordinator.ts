/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IBatchResult } from ".";
import { BufferedDispatchContext } from "..";
import { DefaultComponentContext } from "../../defaults";
import {
    IComponentContext,
    ILogger,
    IMessage,
    IMessageMetricAnnotator,
    IMetrics,
    IMetricTags,
    IOutputSink,
    IPublishedMessage,
    IRequireInitialization,
    IStateVerification,
    IStoredMessage,
    MessageProcessingMetrics,
    MessageProcessingResults,
    OutputSinkConsistencyLevel,
    StateRef,
} from "../../model";
import { iterate, prettyEventName } from "../../utils";
import { BatchHandler } from "./BatchHandler";

export class SinkCoordinator implements IRequireInitialization {
    private readonly storeTarget: BatchHandler<IStoredMessage | IStateVerification>;
    private readonly storeIsIdempotent: boolean;
    private readonly publishTarget: BatchHandler<IPublishedMessage>;
    private metrics: IMetrics;
    private logger: ILogger;

    constructor(
        storeSink: IOutputSink<IStoredMessage | IStateVerification>,
        publishSink: IOutputSink<IPublishedMessage>,
        private readonly annotators: IMessageMetricAnnotator[]
    ) {
        this.metrics = DefaultComponentContext.metrics;
        this.logger = DefaultComponentContext.logger;
        this.storeIsIdempotent = storeSink.guarantees.idempotent;
        switch (storeSink.guarantees.consistency) {
            case OutputSinkConsistencyLevel.Atomic:
            case OutputSinkConsistencyLevel.None:
                this.storeTarget = new BatchHandler(storeSink, this.storeTargetItems, () => true);
                break;
            case OutputSinkConsistencyLevel.AtomicPerPartition:
                this.storeTarget = new BatchHandler(
                    storeSink,
                    this.storeTargetItems,
                    (p, c) => !p || p.state.key === c.state.key
                );
                break;
            default:
                throw new Error(
                    `unsupported consistency level '${storeSink.guarantees.consistency}' for store sink`
                );
        }

        switch (publishSink.guarantees.consistency) {
            case OutputSinkConsistencyLevel.Atomic:
            case OutputSinkConsistencyLevel.None:
                this.publishTarget = new BatchHandler(publishSink, (item) => item.published);
                break;
            case OutputSinkConsistencyLevel.AtomicPerPartition:
                this.publishTarget = new BatchHandler(
                    publishSink,
                    (item) => item.published,
                    (p, c) => !p || p.metadata.key === c.metadata.key
                );
                break;
            default:
                throw new Error(
                    `unsupported consistency level '${publishSink.guarantees.consistency}' for publish sink`
                );
        }
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.metrics = context.metrics;
        this.logger = context.logger;
    }

    public async handle(
        items: IterableIterator<BufferedDispatchContext>,
        bail: (err: any) => never
    ): Promise<IBatchResult> {
        const contexts = Array.from(items);
        const storeResult = await this.storeTarget.handle(contexts, bail);
        this.emitMetrics(
            this.stored(storeResult.successful),
            this.stored(storeResult.failed),
            MessageProcessingMetrics.Store
        );
        if (storeResult.error) {
            // if any of the BufferedDispatchContexts were successfully
            // processed then we need to make sure the corresponding publishes
            // are processed before we bail with an error for the failed items
            const { successful } = storeResult;
            const publishResult = await this.publishTarget.handle(successful, bail);
            this.emitMetrics(
                this.published(publishResult.successful),
                this.published(publishResult.failed),
                MessageProcessingMetrics.Publish
            );

            if (publishResult.error) {
                const { failed } = publishResult;
                this.logger.error(
                    `failed to publish ${failed.length} items that were successfully stored, downstream systems might be out of sync`,
                    publishResult.error.error
                );
            }

            return storeResult;
        }

        const publishResult = await this.publishTarget.handle(contexts, bail);
        this.emitMetrics(
            this.published(publishResult.successful),
            this.published(publishResult.failed),
            MessageProcessingMetrics.Publish
        );
        if (publishResult.error) {
            // Unless the storeTarget is idempotent
            // we cannot allow publishing to be retried
            // --> this flag is true for the NullOutputSink
            //     in case there is no store sink
            if (!this.storeIsIdempotent) {
                return {
                    ...publishResult,
                    error: {
                        ...publishResult.error,
                        retryable: false,
                    },
                };
            }
        }

        return publishResult;
    }

    private stored(items: BufferedDispatchContext[]): IterableIterator<IMessage> {
        return iterate(
            items
                .map((i) => Array.from(i.stored))
                .reduce((p, c) => p.concat(c), [])
                .map((i) => i.message)
        );
    }

    private published(items: BufferedDispatchContext[]): IterableIterator<IMessage> {
        return iterate(
            items
                .map((i) => Array.from(i.published))
                .reduce((p, c) => p.concat(c), [])
                .map((i) => i.message)
        );
    }

    private *storeTargetItems(
        ctx: BufferedDispatchContext
    ): IterableIterator<IStoredMessage | IStateVerification> {
        const items = new Map<string, StateRef>();
        for (const item of ctx.loadedStates) {
            items.set(item.key, item);
        }
        for (const msg of ctx.stored) {
            items.delete(msg.state.key);
        }

        yield* ctx.stored;
        for (const state of items.values()) {
            yield {
                original: ctx.source,
                state,
            };
        }
    }

    private emitMetrics(
        success: IterableIterator<IMessage>,
        failed: IterableIterator<IMessage>,
        metric: MessageProcessingMetrics
    ): void {
        for (const msg of success) {
            const baseTags = this.annotate(msg);
            const type = prettyEventName(msg.type);
            this.metrics.increment(metric, {
                ...baseTags,
                result: MessageProcessingResults.Success,
                event_type: type,
            });
        }
        for (const msg of failed) {
            const baseTags = this.annotate(msg);
            const type = prettyEventName(msg.type);
            this.metrics.increment(metric, {
                ...baseTags,
                result: MessageProcessingResults.Error,
                event_type: type,
            });
        }
    }

    private annotate(msg: IMessage): IMetricTags {
        const tags = {};
        for (const r of this.annotators) {
            const t = r.annotate(msg);
            for (const key of Object.keys(t)) {
                tags[key] = t[key];
            }
        }
        return tags;
    }
}
