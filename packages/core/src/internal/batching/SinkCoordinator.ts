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
    EventProcessingMetadata,
    SequenceConflictError,
} from "../../model";
import { iterate, prettyEventName, RetrierContext } from "../../utils";
import { BatchHandler } from "./BatchHandler";

export class SinkCoordinator implements IRequireInitialization {
    private readonly storeTarget: BatchHandler<IStoredMessage | IStateVerification>;
    private readonly storeIsIdempotent: boolean;
    private readonly publishTarget: BatchHandler<IPublishedMessage>;
    private metrics: IMetrics;
    private logger: ILogger;
    private epochCache: Map<string, number>;
    private isCachingRpc: boolean;

    constructor(
        storeSink: IOutputSink<IStoredMessage | IStateVerification>,
        publishSink: IOutputSink<IPublishedMessage>,
        private readonly annotators: IMessageMetricAnnotator[],
        isCachingRpc?: boolean
    ) {
        this.isCachingRpc = isCachingRpc;
        this.epochCache = new Map<string, number>();
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

    private checkSequence(contexts: BufferedDispatchContext<any>[]): IBatchResult {
        const successful: BufferedDispatchContext<any>[] = [];
        const failed: BufferedDispatchContext<any>[] = [];
        const tuples = new Map<string, number[]>();
        let shouldBreak = false;
        let error;
        let ii = 0;
        for (ii = 0; ii < contexts.length; ii++) {
            const items = Array.from(this.storeTargetItems(contexts[ii]));
            for (const message of items) {
                const currentState = message.state;
                if (tuples.has(currentState.key)) {
                    const tuple = tuples.get(currentState.key);
                    const seq = message.original.metadata<number>(EventProcessingMetadata.Sequence);
                    if (tuple[0] !== seq) {
                        if (tuple[1] !== currentState.seqNum) {
                            error = {
                                error: new SequenceConflictError({
                                    key: currentState.key,
                                    actualSn: tuple[1],
                                    expectedSn: currentState.seqNum,
                                    newSn: currentState.seqNum + 1,
                                }),
                                retryable: true,
                            };
                            shouldBreak = true;
                            break;
                        } else {
                            tuple[0] = seq;
                            tuple[1]++;
                        }
                    } else {
                        tuple[1]++;
                    }
                    tuples.set(currentState.key, tuple);
                } else {
                    const seq = message.original.metadata<number>(EventProcessingMetadata.Sequence);
                    tuples.set(currentState.key, [seq, currentState.seqNum + 1]);
                }
            }
            if (shouldBreak) {
                break;
            }
            successful.push(contexts[ii]);
        }
        for (; ii < contexts.length; ii++) {
            failed.push(contexts[ii]);
        }
        return {
            successful,
            failed,
            error,
        };
    }

    private checkEpochs(contexts: BufferedDispatchContext<any>[]): IBatchResult {
        if (!this.isCachingRpc) {
            return {
                successful: contexts,
                failed: [],
                error: undefined,
            };
        }
        const successful: BufferedDispatchContext<any>[] = [];
        const failed: BufferedDispatchContext<any>[] = [];
        let shouldBreak = false;
        let error;
        let ii = 0;
        for (ii = 0; ii < contexts.length; ii++) {
            const items = Array.from(this.storeTargetItems(contexts[ii]));
            for (const message of items) {
                const currentState = message.state;
                let epoch = this.epochCache.get(currentState.key);
                if (epoch === undefined) {
                    this.epochCache.set(currentState.key, 0);
                    epoch = 0;
                }
                const stateEpoch = currentState.epoch;
                if (stateEpoch !== -1 && stateEpoch < epoch) {
                    error = {
                        error: new SequenceConflictError({
                            key: currentState.key,
                            actualSn: -2,
                            expectedSn: -2,
                            newSn: -2,
                        }),
                        retryable: true,
                    };
                    shouldBreak = true;
                    break;
                }
            }
            if (shouldBreak) {
                break;
            }
            successful.push(contexts[ii]);
        }
        for (; ii < contexts.length; ii++) {
            failed.push(contexts[ii]);
        }
        return {
            successful,
            failed,
            error,
        };
    }

    public async handle(
        items: IterableIterator<BufferedDispatchContext>,
        retry: RetrierContext
    ): Promise<IBatchResult> {
        const contexts = Array.from(items);
        const sequenceCheckResults = this.checkSequence(contexts);
        const epochCheckResults = this.checkEpochs(sequenceCheckResults.successful);
        const storeHandledResult = await this.storeTarget.handle(
            epochCheckResults.successful,
            retry,
            undefined
        );
        const storeResult = {
            successful: storeHandledResult.successful,
            failed: storeHandledResult.failed
                .concat(epochCheckResults.failed)
                .concat(sequenceCheckResults.failed),
            error:
                storeHandledResult.error || epochCheckResults.error || sequenceCheckResults.error,
        };
        if (
            storeHandledResult.error &&
            (storeHandledResult.error.error as SequenceConflictError).details
        ) {
            const key = (storeHandledResult.error.error as SequenceConflictError).details.key;
            const cache = this.epochCache.get(key) + 1;
            this.epochCache.set(key, cache);
        }
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
            const publishResult = await this.publishTarget.handle(successful, retry);
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

        const publishResult = await this.publishTarget.handle(contexts, retry);
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
