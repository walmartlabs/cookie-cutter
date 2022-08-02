/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    EventSourcedMetadata,
    IInputSource,
    IMessageEncoder,
    IOutputSink,
    IPublishedMessage,
} from "@walmartlabs/cookie-cutter-core";
import { KafkaPublisherConfiguration, KafkaSubscriptionConfiguration } from "./config";
import { KafkaSink } from "./KafkaSink";
import { KafkaSource } from "./KafkaSource";
import { IRawKafkaMessage } from "./model";
import * as tls from "tls";

export enum KafkaOffsetResetStrategy {
    // starts consuming from the latest offset if no consumer group is present
    Latest = 1,
    // starts consuming from the earliest offset if no consumer group is present
    Earliest,
    // always starts consuming from the latest offset even if a consumer group is present
    AlwaysLatest,
    // always starts consuming from the earliest offset even if a consumer group is present
    AlwaysEarliest,
}

export interface IKafkaHeaderNames {
    readonly eventType: string;
    readonly sequenceNumber: string;
    readonly stream: string;
    readonly timestamp: string;
    readonly contentType: string;
}

export const DefaultKafkaHeaderNames: IKafkaHeaderNames = {
    eventType: EventSourcedMetadata.EventType,
    sequenceNumber: EventSourcedMetadata.SequenceNumber,
    stream: EventSourcedMetadata.Stream,
    timestamp: EventSourcedMetadata.Timestamp,
    contentType: "X-Message-Type",
};

export interface IKafkaBrokerConfiguration {
    readonly broker: string | string[];
    readonly encoder: IMessageEncoder;
    readonly headerNames?: IKafkaHeaderNames;
    readonly ssl?: tls.ConnectionOptions;
}

export interface IKafkaSubscriptionConfiguration {
    /**
     * Kafka consumer group id
     */
    readonly group: string;
    /**
     * Topics to consume
     */
    readonly topics: string | (string | IKafkaTopic)[];
    /**
     * Whether message consumption should be enable Exactly once Semantics (EoS).
     *
     * If EOS, consumed offset for a message will only be committed
     * when a message has been released.
     *
     * Allows consumer to participate in the "consume-transform-producer" loop
     */
    readonly eos?: boolean;
    readonly consumeTimeout?: number;
    readonly maxBytesPerPartition?: number;
    /**
     * The rate at which to periodically commit offsets to Kafka. Defaults to 60000 ms (1 min).
     */
    readonly offsetCommitInterval?: number;

    readonly preprocessor?: IKafkaMessagePreprocessor;

    /**
     * Timeout used to detect failures.
     * The consumer sends periodic heartbeats to indicate its liveness to the broker.
     * If no heartbeats are received by the broker before the expiration of this session timeout,
     * then the broker will remove this consumer from the group and initiate a rebalance.
     *
     * Defaults to 30s, src: https://kafka.js.org/docs/consuming
     */
    readonly sessionTimeout?: number;

    /**
     * Additional header names.
     * Useful when consuming messages that have additional information in the message header that
     * needs to be available in message metadata.
     */
    readonly additionalHeaderNames?: { [key: string]: string };
}

export interface IKafkaClientConfiguration {
    /*
     * Time in milliseconds to wait for a successful connection. The default value is: 1000
     * https://kafka.js.org/docs/configuration#connection-timeout
     */
    readonly connectionTimeout?: number;

    /*
     * Time in milliseconds to wait for a successful request. The default value is: 30000
     * https://kafka.js.org/docs/configuration#request-timeout
     */
    readonly requestTimeout?: number;

    /*
     * Use ClientIdPrefix to quickly identify kafka client.
     * https://kafka.js.org/docs/configuration#broker-discovery
     */
    readonly clientIdPrefix?: string;
}

export enum KafkaMessagePublishingStrategy {
    NonTransactional = 1,
    Transactional,
    ExactlyOnceSemantics,
}

export enum KafkaPublisherCompressionMode {
    /** Messages will be published as-is without any compression. */
    None = 1,
    /** Messages will be compressed with the Gzip algorithm before being published. */
    Gzip,
    /** Messages will be compressed with the Snappy algorithm before being published. */
    Snappy,
    /** Messages will be compressed with the LZ4 algorithm before being published. */
    LZ4,
}

export interface IKafkaPublisherConfiguration {
    readonly defaultTopic?: string;
    readonly maximumBatchSize?: number;
    /**
     * The message publishing strategy to use for the underlying
     * kafka publisher. `Transactional` will attempt to publish
     * using kafka transactions and rollback on any errors. `ExactlyOnceSemantics`
     * will attempt commit offsets for any consumed messages as part of a
     * "consume-transform-produce" loop within a kafka transaction. In order to
     * enable `ExactlyOnceSemantics` a corresponding KafkaSource needs to be setup
     * with the `eos` option turned on. Defaults to `NonTransactional`.
     */
    readonly messagePublishingStrategy?: KafkaMessagePublishingStrategy;
    /**
     * Unique ID which will be associated with producer's transactions.
     *
     * Should be static across application runs. From the docs:
     * > The key to fencing out zombies properly is to ensure that the input topics
     * > and partitions in the read-process-write cycle is always the same for a given
     * > transactional.id. If this isn’t true, then it is possible for some messages to
     * > leak through the fencing provided by transactions.
     */
    readonly transactionalId?: string;
    /**
     * Determines which compression mode, if any, should be used to produce messages.
     * Defaults to `None`.
     */
    readonly compressionMode?: KafkaPublisherCompressionMode;
    /*
     * Use ClientIdPrefix to quickly identify kafka client.
     * https://kafka.js.org/docs/configuration#broker-discovery
     */
    readonly clientIdPrefix?: string;
}

export interface IKafkaTopic {
    readonly name: string;
    readonly offsetResetStrategy?: KafkaOffsetResetStrategy;
}

export enum KafkaMetadata {
    Timestamp = "timestamp",
    Topic = "topic",
    Offset = "offset",
    Partition = "partition",
    Key = "key",
    Tombstone = "tombstone",
    ExactlyOnceSemantics = "eos",
    ConsumerGroupId = "consumerGroupId",
    ConsumerGroupEpoch = "consumerGroupEpoch",
}

export { IRawKafkaMessage } from "./model";

export interface IKafkaMessagePreprocessor {
    process(msg: IRawKafkaMessage): IRawKafkaMessage;
}

export function kafkaSource(
    configuration: IKafkaBrokerConfiguration &
        IKafkaSubscriptionConfiguration &
        IKafkaClientConfiguration
): IInputSource {
    configuration = config.parse(KafkaSubscriptionConfiguration, configuration, {
        consumeTimeout: 50,
        offsetCommitInterval: 5000,
        eos: false,
        headerNames: DefaultKafkaHeaderNames,
        preprocessor: {
            process: (msg) => msg,
        },
        connectionTimeout: 1000,
        requestTimeout: 30000,
    });
    return new KafkaSource(configuration);
}

export function kafkaSink(
    configuration: IKafkaBrokerConfiguration & IKafkaPublisherConfiguration
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(KafkaPublisherConfiguration, configuration, {
        messagePublishingStrategy: KafkaMessagePublishingStrategy.NonTransactional,
        maximumBatchSize: 1000,
        headerNames: DefaultKafkaHeaderNames,
        compressionMode: KafkaPublisherCompressionMode.None,
    });
    return new KafkaSink(configuration);
}
