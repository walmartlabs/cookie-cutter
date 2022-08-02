/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    AsyncPipe,
    DefaultComponentContext,
    IComponentContext,
    IDisposable,
    IInputSourceContext,
    ILogger,
    IMetrics,
    IRequireInitialization,
} from "@walmartlabs/cookie-cutter-core";
import {
    Admin,
    Consumer,
    ConsumerCrashEvent,
    ConsumerGroupJoinEvent,
    IMemberAssignment,
    Kafka,
    Offsets,
    PartitionAssigners,
    PartitionOffset,
    RequestQueueSizeEvent,
    RetryOptions,
} from "kafkajs";
import Long = require("long");
import {
    IKafkaBrokerConfiguration,
    IKafkaClientConfiguration,
    IKafkaSubscriptionConfiguration,
    IKafkaTopic,
    KafkaMetadata,
    KafkaOffsetResetStrategy,
} from ".";
import { IMessageHeaders, IRawKafkaMessage } from "./model";
import { OffsetManager } from "./OffsetManager";
import { generateClientId, loadCompressionPlugins } from "./utils";

loadCompressionPlugins();

enum KafkaMetrics {
    RequestQueueSize = "cookie_cutter.kafka_consumer.request_queue_size",
    IncomingBatchSize = "cookie_cutter.kafka_consumer.incoming_batch_size",
    OffsetCommitted = "cookie_cutter.kafka_consumer.offset_committed",
    OffsetHighWatermark = "cookie_cutter.kafka_consumer.offset_high_watermark", // highest offset available on the broker
    OffsetLowWatermark = "cookie_cutter.kafka_consumer.offset_low_watermark", // lowest offset available on broker (based on retention policy)
    Lag = "cookie_cutter.kafka_consumer.lag", // lag = high watermark - committed
}

export type KafkaConsumerConfig = IKafkaBrokerConfiguration &
    IKafkaSubscriptionConfiguration &
    IKafkaClientConfiguration;

const EARLIEST_OFFSET: string = "-2";
const LATEST_OFFSET: string = "-1";

/**
 * Wrapper class to consume Kafka messages using Kafkajs
 */
export class KafkaConsumer implements IRequireInitialization, IDisposable {
    private config: KafkaConsumerConfig;
    private logger: ILogger;
    private metrics: IMetrics;

    private admin: Admin;
    private consumer: Consumer;
    private offsetManager: OffsetManager;
    private currentMemberAssignment: IMemberAssignment = {};
    private pipe = new AsyncPipe<IRawKafkaMessage>();
    private done = false;
    private offsetCommitIntervalMs: number;
    private timer: NodeJS.Timer;
    private groupEpoch: number = 0;
    private brokerMetadataErrors: number = 0;

    constructor(config: KafkaConsumerConfig) {
        this.config = config;
        this.offsetCommitIntervalMs = config.offsetCommitInterval;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
        this.offsetManager = new OffsetManager();
    }

    public async initialize(context: IComponentContext) {
        this.logger = context.logger;
        this.metrics = context.metrics;
    }

    public get epoch(): number {
        return this.groupEpoch;
    }

    /**
     * Consume messages from configured topics. Expose each message via generator.
     */
    public async *consume(context: IInputSourceContext): AsyncIterableIterator<IRawKafkaMessage> {
        const topics: IKafkaTopic[] = [];
        for (const t of this.config.topics as IKafkaTopic[]) {
            topics.push({
                name: t.name,
                offsetResetStrategy: setOffsetStrategy(t.offsetResetStrategy),
            });
        }

        /*
            Calculation according to
            https://kafka.js.org/docs/retry-detailed

                   min  |  max
            ---|--------|----------
            1  |    300 |     300
            2  |    459 |     561
            3  |    702 |   1,049
            4  |  1,074 |   1,962
            5  |  1,644 |   3,668
            6  |  2,515 |   6,860
            7  |  3,848 |  12,828
            8  |  5,888 |  23,989
            9  |  9,009 |  44,859
            10 | 13,783 |  83,887
            =====================
                 39,223   179,964
        */
        const retry: RetryOptions = {
            maxRetryTime: 90 * 1000,
            initialRetryTime: 300,
            factor: 0.1,
            multiplier: 1.7,
            retries: 10,
        };

        const { broker, ssl, clientIdPrefix } = this.config;
        const client = new Kafka({
            clientId: generateClientId(clientIdPrefix),
            brokers: Array.isArray(broker) ? broker : [broker],
            ssl,
            connectionTimeout: this.config.connectionTimeout,
            requestTimeout: this.config.requestTimeout,
        });

        this.admin = client.admin({
            retry,
        });

        this.consumer = client.consumer({
            groupId: this.config.group,
            partitionAssigners: [PartitionAssigners.roundRobin],
            maxBytesPerPartition: this.config.maxBytesPerPartition,
            maxWaitTimeInMs: this.config.consumeTimeout,
            sessionTimeout: this.config.sessionTimeout,
            retry,
        });

        const topicsToRewind = new Set<string>(
            topics
                .filter((t) => t.offsetResetStrategy === KafkaOffsetResetStrategy.AlwaysEarliest)
                .map((t) => t.name)
        );
        const topicsToForward = new Set<string>(
            topics
                .filter((t) => t.offsetResetStrategy === KafkaOffsetResetStrategy.AlwaysLatest)
                .map((t) => t.name)
        );

        await this.consumer.connect();
        await this.admin.connect();

        this.consumer.on(
            this.consumer.events.GROUP_JOIN,
            ({ payload: { memberAssignment } }: ConsumerGroupJoinEvent) => {
                this.groupEpoch++;

                // TODO: once https://github.com/tulios/kafkajs/issues/592
                // is resolved move this code to the callback for
                // the synchronization barrier
                const epoch = this.groupEpoch;
                context
                    .evict(
                        (msg) =>
                            typeof msg.metadata<number>(KafkaMetadata.ConsumerGroupEpoch) ===
                                "number" &&
                            msg.metadata<number>(KafkaMetadata.ConsumerGroupEpoch) < epoch
                    )
                    .catch((e) => {
                        this.logger.error("failed to evict in-flight messages on rebalance", e);
                    });

                if (!memberAssignment) {
                    throw new Error("Member assignment missing in KafkaJS join event");
                }

                // Use `consumer.seek()` to read from the earliest offset on all partitions
                // A. marked as rewind & B. not presently being consumed
                Object.keys(memberAssignment)
                    .filter((topic) => topicsToRewind.has(topic))
                    .forEach((topic) => {
                        memberAssignment[topic]
                            .filter((partition) => {
                                return (
                                    !this.currentMemberAssignment[topic] ||
                                    this.currentMemberAssignment[topic].indexOf(partition) === -1
                                );
                            })
                            .forEach((partition) => {
                                this.consumer.seek({ topic, partition, offset: EARLIEST_OFFSET });
                            });
                    });

                // Use `consumer.seek()` to read from the latest offset on all partitions
                // A. marked as forward & B. not presently being consumed
                Object.keys(memberAssignment)
                    .filter((topic) => topicsToForward.has(topic))
                    .forEach((topic) => {
                        memberAssignment[topic]
                            .filter((partition) => {
                                return (
                                    !this.currentMemberAssignment[topic] ||
                                    this.currentMemberAssignment[topic].indexOf(partition) === -1
                                );
                            })
                            .forEach((partition) => {
                                this.consumer.seek({ topic, partition, offset: LATEST_OFFSET });
                            });
                    });

                this.currentMemberAssignment = { ...memberAssignment };
                this.offsetManager.resetAddedOffsets();
                // TODO - When we have a re-balance call the admin API and get the low water mark offset for the topic
                // By default we're setting the offset to an empty string for now and populating only topic and partition
                // information to be used by the OffsetManager. We don't be able to periodically commit offsets for new consumers that
                // don't have messages coming in until this is fixed.
                Object.keys(memberAssignment).forEach((topic) => {
                    const partitions: PartitionOffset[] = memberAssignment[topic].map(
                        (partitionNumber) => {
                            return { partition: partitionNumber, offset: "" };
                        }
                    );
                    const offsets = { topics: [{ topic, partitions }] };
                    this.offsetManager.addOffsets(offsets);
                });
            }
        );
        this.consumer.on(
            this.consumer.events.CRASH,
            ({ payload: { error, groupId } }: ConsumerCrashEvent) => {
                this.logger.error("Kafkajs Crashed", { error, groupId });
                // tslint:disable-next-line:no-floating-promises
                this.pipe.throw(error);
            }
        );
        this.consumer.on(
            this.consumer.events.REQUEST_QUEUE_SIZE,
            ({ payload: { broker, clientId, queueSize } }: RequestQueueSizeEvent) => {
                this.logger.debug("Kafkajs Network Request Queue Size", {
                    broker,
                    clientId,
                    queueSize,
                });
                this.metrics.gauge(KafkaMetrics.RequestQueueSize, queueSize);
            }
        );

        await Promise.all(
            topics.map(({ name, offsetResetStrategy }) =>
                this.consumer.subscribe({
                    topic: name,
                    fromBeginning:
                        offsetResetStrategy === KafkaOffsetResetStrategy.Earliest ||
                        offsetResetStrategy === KafkaOffsetResetStrategy.AlwaysEarliest,
                })
            )
        );
        if (!this.config.eos) {
            this.timer = setTimeout(() => {
                // tslint:disable-next-line:no-floating-promises
                this.commitOffsetsIfNecessary();
            }, 0);
            this.timer.unref();
        }

        await this.consumer.run({
            autoCommit: false,
            autoCommitThreshold: 1,
            eachBatchAutoResolve: false,
            eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
                const { topic, partition, messages } = batch;
                this.metrics.gauge(KafkaMetrics.IncomingBatchSize, messages.length, {
                    topic,
                    partition,
                });
                for (const { offset, key, value, timestamp, headers } of messages) {
                    const iMessageHeaders: IMessageHeaders = {};
                    for (const key of Object.keys(headers)) {
                        const header = headers[key];
                        if (Array.isArray(header)) {
                            if (header.length > 0 && typeof header[0] !== "string") {
                                const stringArr: string[] = [];
                                (header as Buffer[]).forEach((element) => {
                                    stringArr.push((element as Buffer).toString());
                                });
                                iMessageHeaders[key] = stringArr;
                            } else {
                                iMessageHeaders[key] = header as string[];
                            }
                        } else if (typeof header !== "string") {
                            iMessageHeaders[key] = header.toString();
                        } else {
                            iMessageHeaders[key] = header;
                        }
                    }
                    if (this.done) {
                        return;
                    }
                    try {
                        await this.pipe.send({
                            topic,
                            partition,
                            offset,
                            key,
                            value,
                            timestamp,
                            headers: iMessageHeaders,
                        });
                    } catch (e) {
                        // pipe was closed, good to exit
                        break;
                    } finally {
                        await heartbeat();
                    }
                }

                // resolve offset manually for topics and partitions that we currently control
                if (
                    this.currentMemberAssignment[topic] &&
                    this.currentMemberAssignment[topic].indexOf(partition) >= 0
                ) {
                    resolveOffset(batch.lastOffset());
                }
            },
        });
        yield* this.pipe;
    }

    /**
     * Queue up offsets with the OffsetManager to be committed at a later time.
     *
     */
    public addOffsets(offsets: Offsets): void {
        this.offsetManager.addOffsets(offsets);
    }

    /**
     * commitOffsetsIfNecessary attempts to periodically commit the current offsets
     * available to this consumer group from the OffsetManager.
     */
    public async commitOffsetsIfNecessary(): Promise<void> {
        if (this.done) {
            return;
        }

        try {
            if (this.consumer) {
                const topics = new Set<string>();
                const committed = new Map<string, Map<number, Long>>();
                try {
                    const offsets = this.offsetManager.offsetsToCommit();
                    await this.consumer.commitOffsets(offsets);
                    for (const offset of offsets) {
                        topics.add(offset.topic);
                        let partitionMap = committed.get(offset.topic);
                        if (!partitionMap) {
                            partitionMap = new Map<number, Long>();
                            committed.set(offset.topic, partitionMap);
                        }
                        const o = Long.fromString(offset.offset);
                        partitionMap.set(offset.partition, o);

                        this.metrics.gauge(KafkaMetrics.OffsetCommitted, o.toNumber(), {
                            topic: offset.topic,
                            partition: offset.partition,
                        });
                    }
                } catch (e) {
                    this.logger.error("Unable to commit offsets", e);
                }

                try {
                    const watermarks = await Promise.all(
                        Array.from(topics.values()).map(async (t) => {
                            const response = await this.admin.fetchTopicOffsets(t);
                            return response.map((r) => ({
                                topic: t,
                                ...r,
                            }));
                        })
                    );

                    for (const wm of watermarks.reduce((p, v) => p.concat(...v), [])) {
                        const high = Long.fromString(wm.high);
                        const low = Long.fromString(wm.low);
                        const offset =
                            committed.get(wm.topic) && committed.get(wm.topic).get(wm.partition);
                        const tags = { topic: wm.topic, partition: wm.partition };
                        if (offset) {
                            const lag = high.subtract(offset);
                            this.metrics.gauge(
                                KafkaMetrics.OffsetHighWatermark,
                                high.toNumber(),
                                tags
                            );
                            this.metrics.gauge(
                                KafkaMetrics.OffsetLowWatermark,
                                low.toNumber(),
                                tags
                            );
                            this.metrics.gauge(KafkaMetrics.Lag, lag.toNumber(), tags);
                        }
                    }

                    this.brokerMetadataErrors = 0;
                } catch (e) {
                    this.logger.warn("Unable to retrieve watermarks", e);

                    // this is a workaround for https://github.com/walmartlabs/cookie-cutter/issues/185
                    // until a fix for kafkajs is available / the root cause of the problem is confirmed
                    if (
                        e &&
                        JSON.stringify(e).includes(
                            "server is not the leader for that topic-partition"
                        )
                    ) {
                        this.brokerMetadataErrors++;
                    }

                    if (this.brokerMetadataErrors > 10) {
                        this.logger.error("detected stale broker metadata in kafkajs");
                        this.brokerMetadataErrors = 0;

                        // throwing an error here will cause a UnhandledPromiseException
                        // and terminate the application
                        throw new Error("stale broker metadata");
                    }
                }
            }
        } finally {
            this.timer = setTimeout(() => {
                // tslint:disable-next-line:no-floating-promises
                this.commitOffsetsIfNecessary();
            }, this.offsetCommitIntervalMs);
            this.timer.unref();
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
        await this.pipe.close();
    }

    public async dispose(): Promise<void> {
        // finish committing any left over offsets before closing the consumer
        if (this.consumer) {
            await this.consumer.commitOffsets(this.offsetManager.offsetsToCommit());
        }
        if (this.consumer) {
            await this.consumer.disconnect();
        }
        if (this.admin) {
            await this.admin.disconnect();
        }
        if (this.timer) {
            clearTimeout(this.timer);
        }
    }
}

function setOffsetStrategy(strategy: KafkaOffsetResetStrategy): KafkaOffsetResetStrategy {
    return strategy === undefined ? KafkaOffsetResetStrategy.Earliest : strategy;
}
