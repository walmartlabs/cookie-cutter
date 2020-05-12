/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    EventSourcedMetadata,
    IComponentContext,
    IMessage,
    IMessageEncoder,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    isEmbeddable,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { IQueueConfiguration, QueueMetadata } from "..";
import { QueueClient, QueueClientWithLargeItemSupport } from "../../utils";

export class QueueOutputSink implements IOutputSink<IPublishedMessage>, IRequireInitialization {
    private readonly encoder: IMessageEncoder;
    private readonly client: QueueClient;

    public readonly guarantees: IOutputSinkGuarantees = {
        idempotent: false,
        consistency: OutputSinkConsistencyLevel.None,
    };

    constructor(private config: IQueueConfiguration) {
        this.client = QueueClientWithLargeItemSupport.create(this.config);
        this.encoder = config.encoder;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        await this.client.initialize(context);
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        for (const msg of output) {
            const queueName = msg.metadata[QueueMetadata.QueueName];
            const visibilityTimeoutSeconds = msg.metadata[QueueMetadata.VisibilityTimeout];
            const messageTimeToLiveSeconds = msg.metadata[QueueMetadata.TimeToLive];
            const visibilityTimeoutMs = msg.metadata[QueueMetadata.VisibilityTimeoutMs];
            const messageTimeToLiveMs = msg.metadata[QueueMetadata.TimeToLiveMs];
            const visibilityTimeout = visibilityTimeoutMs
                ? Math.floor(visibilityTimeoutMs / 1000)
                : visibilityTimeoutSeconds;
            const messageTimeToLive = messageTimeToLiveMs
                ? Math.floor(messageTimeToLiveMs / 1000)
                : messageTimeToLiveSeconds;
            const headers = {
                [EventSourcedMetadata.EventType]: msg.message.type,
            };
            const payload = this.encode(msg.message);
            await this.client.write(msg.spanContext, payload, headers, {
                queueName,
                visibilityTimeout,
                messageTimeToLive,
            });
        }
    }

    private encode(msg: IMessage): any {
        if (isEmbeddable(this.encoder)) {
            return this.encoder.toJsonEmbedding(this.encoder.encode(msg));
        }
        return this.encoder.encode(msg);
    }
}
