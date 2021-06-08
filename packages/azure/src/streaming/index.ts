/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IInputSource,
    IMessageDeduper,
    IMessageEncoder,
    IOutputSink,
    IPublishedMessage,
} from "@walmartlabs/cookie-cutter-core";
import { ICosmosConfiguration } from "..";
import { CosmosConfiguration } from "../config";
import { CosmosMessageDeduper } from "../event-sourced/internal";
import { CosmosClient, EnvelopeQueueMessagePreprocessor, IQueueMessage } from "../utils";
import {
    CosmosOutputSink,
    QueueConfiguration,
    QueueInputSource,
    QueueOutputSink,
    QueueSourceConfiguration,
} from "./internal";

export interface IQueueMessagePreprocessor {
    process(payload: string): IQueueMessage;
}

export interface IDeadLetterQueueConfiguration {
    readonly queueName: string;
    readonly maxDequeueCount: number;
    /**
     * The time-to-live interval for the message, in seconds. The maximum time-to-live allowed is 7 days. If this parameter
     * is omitted, the default time-to-live is 7 days (604800 seconds)
     */
    messageTimeToLive?: number;
    /**
     * Specifies the new visibility timeout value, in seconds, relative to server time. The new value must be larger than or
     * equal to 0, and cannot be larger than 7 days (604800 seconds). The visibility timeout of a message cannot be set to a value later than
     * the expiry time (calculated based on time-to-live when updating message). visibilitytimeout should be set to a value smaller than the time-to-live value.
     */
    visibilityTimeout?: number;
    readonly retryCount?: number;
    readonly retryInterval?: number;
}

/**
 * When connecting to a queue, the QueueClient:
 * uses the connectionString (if provided) to connect, otherwise
 * uses the url (if provided) and account and key to connect, otherwise
 * uses the account and key to construct a standard url and connect
 */
export interface IQueueConfiguration {
    /** Ex:
     * `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;
     * AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;
     * BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
     * QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;
     * TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;`
     */
    readonly connectionString?: string;
    /** Ex: `https://account.queue.core.windows.net`
     * Deprecated: uses as a connection string
     */
    readonly url?: string;
    readonly storageAccount?: string;
    readonly storageAccessKey?: string;
    readonly queueName: string;
    readonly preprocessor?: IQueueMessagePreprocessor;
    readonly retryCount?: number;
    readonly retryInterval?: number;
    readonly encoder: IMessageEncoder;
    /** Defaults to the `queue-large-items` */
    readonly largeItemBlobContainer?: string;
    /**
     * If `true` an attempt will be made to create a queue with the
     * given name if it does not exist prior to every write.
     */
    readonly createQueueIfNotExists: boolean;
}

export interface IQueueSourceConfiguration {
    /**
     * (FROM AZURE DOCS)
     * A nonzero integer value that specifies the number of messages to retrieve from the queue,
     * up to a maximum of 32. By default, a single message is retrieved from the queue with this operation.
     */
    numOfMessages?: number;

    /**
     * Required if not peek only. Specifies the new visibility timeout value, in seconds,
     * relative to server time. The new value must be larger than or equal to 0, and cannot be larger than 7 days (604800 seconds).
     * The visibility timeout of a message can be set to a value later than the expiry time.
     */
    visibilityTimeout?: number;
    readonly deadLetterQueue?: IDeadLetterQueueConfiguration;
}

export enum QueueMetadata {
    QueueName = "queue.name",
    VisibilityTimeout = "queue.visibility_timeout",
    VisibilityTimeoutMs = "queue.visibility_timeout_ms",
    TimeToLive = "queue.time_to_live",
    TimeToLiveMs = "queue.time_to_live_ms",
    DequeueCount = "queue.dequeue_count",
    TimeToNextVisible = "queue.time_to_next_visible",
    MessageId = "queue.message_id",
    PopReceipt = "queue.pop_receipt",
}

export function cosmosSink(configuration: ICosmosConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosOutputSink(configuration);
}

export function queueSink(configuration: IQueueConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(QueueConfiguration, configuration, {
        retryCount: 3,
        retryInterval: 5000,
        largeItemBlobContainer: "queue-large-items",
    });
    return new QueueOutputSink(configuration);
}

export function queueSource(
    configuration: IQueueConfiguration & IQueueSourceConfiguration
): IInputSource {
    configuration = config.parse(QueueSourceConfiguration, configuration, {
        retryCount: 3,
        retryInterval: 5000,
        largeItemBlobContainer: "queue-large-items",
        createQueueIfNotExists: false,
        preprocessor: new EnvelopeQueueMessagePreprocessor(),
    });
    return new QueueInputSource(configuration);
}

export function cosmosDeduper(configuration: ICosmosConfiguration): IMessageDeduper {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosMessageDeduper(new CosmosClient(configuration));
}
