/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BufferedDispatchContext } from ".";
import {
    IComponentContext,
    IDisposable,
    IMessage,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    IStateVerification,
    IStoredMessage,
    Lifecycle,
    MessageRef,
    SequenceConflictError,
} from "../model";
import { RetrierContext } from "../utils";
import { SinkCoordinator } from "./batching";
import { EpochManager } from "./EpochManager";

export class CompositeOutputSink
    implements
        IOutputSink<BufferedDispatchContext>,
        IRequireInitialization,
        IDisposable,
        IMessageEnricher
{
    private readonly coordinator: SinkCoordinator;

    constructor(
        private readonly enrichers: IMessageEnricher[],
        annotators: IMessageMetricAnnotator[],
        private readonly publishSink: Lifecycle<IOutputSink<IPublishedMessage>>,
        private readonly storeSink: Lifecycle<IOutputSink<IStoredMessage | IStateVerification>>,
        public readonly guarantees: IOutputSinkGuarantees,
        epochs: EpochManager
    ) {
        this.coordinator = new SinkCoordinator(storeSink, publishSink, annotators, epochs);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.storeSink.initialize(context);
        await this.publishSink.initialize(context);
        await this.coordinator.initialize(context);
    }

    public enrich(msg: IMessage, source?: MessageRef): void {
        for (const e of this.enrichers) {
            e.enrich(msg, source);
        }
    }

    public async sink(
        output: IterableIterator<BufferedDispatchContext>,
        retry: RetrierContext
    ): Promise<void> {
        const result = await this.coordinator.handle(output, retry);

        if (result.error) {
            if (result.error.error instanceof SequenceConflictError) {
                retry.bail(new SequenceConflictError(result.error.error.details, result.failed[0]));
            }

            if (!result.error.retryable) {
                retry.bail(result.error.error);
            }

            throw result.error.error;
        }
    }

    public async dispose(): Promise<void> {
        await this.storeSink.dispose();
        await this.publishSink.dispose();
    }
}
