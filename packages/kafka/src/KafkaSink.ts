/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    EventSourcedMetadata,
    IComponentContext,
    IDisposable,
    ILogger,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    MessageRef,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { paramCase } from "change-case";
import * as kafkajs from "kafkajs";
import Long = require("long");
import { isNullOrUndefined } from "util";
import {
    IKafkaBrokerConfiguration,
    IKafkaPublisherConfiguration,
    KafkaMessagePublishingStrategy,
    KafkaMetadata,
    KafkaPublisherCompressionMode,
} from ".";
import { KafkaMessageProducer } from "./KafkaMessageProducer";
import { IOffsetTracker, IProducerMessage } from "./model";
import { createPartitioner } from "./Partitioner";
import { generateClientId } from "./utils";

type Message = { type: string } & IProducerMessage<Buffer>;

/**
 * Output sink to produce to Kafka topics.
 *
 * ## Transactions and Exactly Once Semantics (EoS)
 *
 * The KafkaSink supports multiple message publishing strategies via the
 * `KafkaMessagePublishingStrategy` option. Using either the `Transactional`
 * or `ExactlyOnceSemantics` options also require `transactionalId` to be set.
 * `ExactlyOnceSemantics`
 *
 * When `Transactional` is enable, the producer will send all messages in the sink as part
 * of the same transaction. If there is an error sending any of the messages
 * then the sink will abort the transaction. Otherwise the sink will commit
 * the transaction after sending all messages.
 *
 * If the sink is set up for `ExactlyOnceSemantics` the same behavior described above
 * for `Transactional` applies along with the sink keeping track of input message offsets
 * if a given message was identified as requiring `ExactlyOnceSemantics` based on the message's
 * metadata field of the same name (This requires the corresponding KafkaSource to enable the
 * `eos` flag during setup to mark messages accordingly). The sink will only send offsets that
 * meet the highwater mark for a topic-partition. This process allows the sink to
 * participate in a "consume-transform-produce" loop between multiple topics.
 */
export class KafkaSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable
{
    private producer: kafkajs.Producer;
    private logger: ILogger;
    private messageProducer: KafkaMessageProducer;
    private useTransactionalProducer: boolean;
    private logMissingKey: boolean | undefined;

    constructor(private readonly config: IKafkaBrokerConfiguration & IKafkaPublisherConfiguration) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this.logger = ctx.logger;

        // If eos or transactional, we must configure the producer to only allow 1 in flight
        // request at a time. Otherwise we cannot guarantee EoS.
        let maxInFlightRequests: number | undefined;
        let idempotent: boolean = false;
        if (
            this.config.messagePublishingStrategy ===
                KafkaMessagePublishingStrategy.Transactional ||
            this.config.messagePublishingStrategy ===
                KafkaMessagePublishingStrategy.ExactlyOnceSemantics
        ) {
            maxInFlightRequests = 1;
            idempotent = true;
            this.useTransactionalProducer = true;
        }
        const { broker, ssl, clientIdPrefix } = this.config;
        const client = new kafkajs.Kafka({
            clientId: generateClientId(clientIdPrefix),
            brokers: Array.isArray(broker) ? broker : [broker],
            ssl,
        });
        this.producer = client.producer({
            idempotent, // An idempotent producer enforces EoS messaging
            transactionalId: this.config.transactionalId,
            maxInFlightRequests,
            createPartitioner,
        });
        await this.producer.connect();

        this.messageProducer = new KafkaMessageProducer(ctx, this.config);
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        let sendWith: kafkajs.Producer | kafkajs.Transaction = this.producer;
        let transaction: kafkajs.Transaction;
        const compressionMode = this.config.compressionMode ?? KafkaPublisherCompressionMode.None;
        let acks = 1; // Only leader
        const offsetTracker: IOffsetTracker = {};

        // configure a transactional producer for either Transactional or ExactlyOnceSemantics message processing strategies
        if (this.useTransactionalProducer) {
            transaction = await this.producer.transaction();
            sendWith = transaction;
            acks = -1; // All replicas
        }

        const messagesByTopic: Map<string, Message[]> = new Map();
        for (const msg of output) {
            const topic =
                msg.metadata[KafkaMetadata.Topic] ||
                defaultTopicName(msg.message.type, this.config);
            if (!messagesByTopic.has(topic)) {
                messagesByTopic.set(topic, []);
            }

            const formattedMsg = this.formatMessage(msg, topic);
            if (isNullOrUndefined(this.logMissingKey) && !formattedMsg.key) {
                this.logMissingKey = true;
            }
            messagesByTopic.get(topic).push(formattedMsg);
            // If message is marked as EoS & sink supports transactions
            // then record the message offset. We will later use this to mark the offset
            // as participating in the transaction
            if (
                transaction &&
                this.config.messagePublishingStrategy ===
                    KafkaMessagePublishingStrategy.ExactlyOnceSemantics &&
                msg.original.metadata<boolean>(KafkaMetadata.ExactlyOnceSemantics)
            ) {
                this.trackOffsets(msg.original, topic, offsetTracker);
            }
        }

        for (const [topic, messages] of messagesByTopic) {
            if (messages.length <= 0) {
                continue;
            }
            if (this.logMissingKey) {
                this.logger.warn("Service is publishing messages without keys");
                this.logMissingKey = false;
            }
            try {
                await this.messageProducer.sendMessages(
                    messages,
                    topic,
                    acks,
                    sendWith,
                    compressionMode
                );

                if (transaction && offsetTracker[topic]) {
                    // Send any offsets participating in transaction for this topic
                    // tslint:disable-next-line:forin
                    for (const consumerGroupId in offsetTracker[topic]) {
                        await transaction.sendOffsets({
                            consumerGroupId,
                            topics: [
                                {
                                    topic,
                                    partitions: groupPartitions(
                                        offsetTracker[topic][consumerGroupId]
                                    ),
                                },
                            ],
                        });
                    }
                }
            } catch (e) {
                if (transaction) {
                    await this.abortTransaction(transaction);
                }

                throw e;
            }
        }

        if (transaction) {
            await transaction.commit();
        }
    }

    public async dispose(): Promise<void> {
        if (this.producer) {
            await this.producer.disconnect();
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
            maxBatchSize: this.config.maximumBatchSize,
        };
    }

    private async abortTransaction(transaction: kafkajs.Transaction): Promise<void> {
        this.logger.debug("Aborting transaction");
        try {
            await transaction.abort();
        } catch (e) {
            // This _probably_ means no messages were ever sent, so we don't need
            // to bubble up the error
            if ((e as any).type === "INVALID_TXN_STATE") {
                this.logger.warn(
                    "Received 'INVALID_TXN_STATE' error while aborting transaction. Ignoring.",
                    e
                );
                return;
            }

            throw e;
        }
    }

    private formatMessage(msg: IPublishedMessage, topic: string): Message {
        const timestamp = Date.now().toString();
        let payload: Buffer | null = null;

        if (!msg.metadata[KafkaMetadata.Tombstone]) {
            payload = Buffer.from(this.config.encoder.encode(msg.message));
        }

        const headers = {
            [this.config.headerNames.timestamp]:
                msg.metadata[EventSourcedMetadata.Timestamp] || timestamp,
            [this.config.headerNames.eventType]:
                msg.metadata[EventSourcedMetadata.EventType] || msg.message.type,
            [this.config.headerNames.contentType]:
                msg.metadata[this.config.headerNames.contentType] || this.config.encoder.mimeType,
        };

        if (msg.metadata[EventSourcedMetadata.Stream]) {
            headers[this.config.headerNames.stream] = msg.metadata[EventSourcedMetadata.Stream];
        }

        if (msg.metadata[EventSourcedMetadata.SequenceNumber]) {
            headers[this.config.headerNames.sequenceNumber] =
                msg.metadata[EventSourcedMetadata.SequenceNumber];
        }

        const possibleKey =
            msg.metadata[KafkaMetadata.Key] || msg.original.metadata(EventSourcedMetadata.Stream);

        return {
            type: msg.message.type,
            key: possibleKey ? Buffer.from(possibleKey) : null,
            topic,
            timestamp,
            partition: msg.metadata[KafkaMetadata.Partition],
            payload,
            headers,
            context: msg.spanContext,
        };
    }

    /**
     * Record message's offset locally _if_ it is the highest offset we have
     * encountered for this message's consume group on the given topic-partition
     */
    private trackOffsets(msg: MessageRef, topic: string, offsetTracker: IOffsetTracker): void {
        const consumerGroupId = msg.metadata<string>(KafkaMetadata.ConsumerGroupId);
        const offset = msg.metadata<string>(KafkaMetadata.Offset);
        const partition = msg.metadata<number>(KafkaMetadata.Partition);

        if (!consumerGroupId) {
            this.logger.warn("Transactional message missing consumer id");
            return;
        }

        if (!offset) {
            this.logger.warn("Transactional message missing offset");
            return;
        }

        if (partition === undefined) {
            this.logger.warn("Transactional message missing partition");
            return;
        }

        if (!offsetTracker[topic]) {
            offsetTracker[topic] = {};
        }

        if (!offsetTracker[topic][consumerGroupId]) {
            offsetTracker[topic][consumerGroupId] = {};
        }

        const previouslyRecordedOffset = offsetTracker[topic][consumerGroupId][partition];

        if (
            !previouslyRecordedOffset ||
            Long.fromValue(previouslyRecordedOffset).lessThan(offset)
        ) {
            offsetTracker[topic][consumerGroupId][partition] = offset;
        }
    }
}

function groupPartitions(partitionsToOffset: { [key: number]: string }): kafkajs.PartitionOffset[] {
    return Object.entries(partitionsToOffset).map(([partition, offset]) => ({
        partition: parseInt(partition, 10),
        offset,
    }));
}

function defaultTopicName(type: string, config: IKafkaPublisherConfiguration): string {
    if (config.defaultTopic) {
        return config.defaultTopic;
    }

    const messageType = type.substr(type.lastIndexOf(".") + 1);
    return paramCase(messageType);
}
