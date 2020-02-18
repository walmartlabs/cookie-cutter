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
import { QueueMessageEncoder } from "azure-storage";
import { ICosmosConfiguration } from "..";
import { CosmosConfiguration } from "../config";
import { CosmosMessageDeduper } from "../event-sourced/internal";
import { CosmosClient } from "../utils";
import {
    CosmosOutputSink,
    QueueConfiguration,
    QueueInputSource,
    QueueOutputSink,
    QueueSourceConfiguration,
} from "./internal";

export interface IQueueConfiguration {
    readonly storageAccount: string;
    readonly storageAccessKey: string;
    readonly queueName: string;
    readonly queueMessageEncoder?: QueueMessageEncoder;
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
     * (FROM AZURE DOCS)
     * Required if not peek only. Specifies the new visibility timeout value, in seconds,
     * relative to server time. The new value must be larger than or equal to 0, and cannot be larger than 7 days (604800 seconds).
     * The visibility timeout of a message can be set to a value later than the expiry time.
     */
    visibilityTimeout?: number;
}

export enum QueueMetadata {
    QueueName = "queue.name",
    VisibilityTimeout = "queue.visibility_timeout",
    TimeToLive = "queue.time_to_live",
    DequeueCount = "queue.dequeue_count",
    TimeToNextVisible = "queue.time_to_next_visible",
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
    });
    return new QueueInputSource(configuration);
}

export function cosmosDeduper(configuration: ICosmosConfiguration): IMessageDeduper {
    configuration = config.parse(CosmosConfiguration, configuration);
    return new CosmosMessageDeduper(new CosmosClient(configuration));
}
