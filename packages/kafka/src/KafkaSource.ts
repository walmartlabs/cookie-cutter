/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    EncodedMessage,
    EventSourcedMetadata,
    failSpan,
    getRootProjectPackageInfo,
    IComponentContext,
    IDisposable,
    IInputSource,
    IInputSourceContext,
    ILogger,
    IMessage,
    IMetrics,
    IRequireInitialization,
    MessageRef,
    OpenTracingTagKeys,
    prettyEventName,
} from "@walmartlabs/cookie-cutter-core";
import { followsFrom, FORMAT_HTTP_HEADERS, Span, Tags, Tracer } from "opentracing";
import { IKafkaBrokerConfiguration, IKafkaSubscriptionConfiguration, KafkaMetadata } from ".";
import { KafkaConsumer } from "./KafkaConsumer";
import { IKafkaMessageMetadata, IRawKafkaMessage, TRACE_HEADER } from "./model";

export const Tombstone = "Tombstone";

enum KafkaMetrics {
    MsgReceived = "cookie_cutter.kafka_consumer.input_msg_received",
    MsgProcessed = "cookie_cutter.kafka_consumer.input_msg_processed",
}
enum KafkaMetricResult {
    Success = "success",
    Error = "error",
}

/**
 * Input source to consume from Kafka topics.
 *
 * Once started the KafkaSink will yield a message ref for each consumed message.
 *
 * Releasing the message ref will cause the consumer to commit the message's offset
 * if it is not marked as an `eos` consumer otherwise it will add the offset to
 * its internal OffsetManager to commit at a later time.
 *
 * ## Transactions and Exactly Once Semantics (EoS)
 *
 * A Kafka consumer is involved in an EoS message processing strategy whenever we only
 * wish to commit offsets for consumed messages once a corresponding Kafka producer has successfully
 * completed a transaction. This is sometimes referred to as a "consume-transform-produce"
 * loop. Used in this way we can ensure a consumer only marks its messages as
 * consumed if all messages within the transaction were processed.
 *
 * The KafkaSource supports EoS via the `eos` flag in the config object.
 * If this flag is `true` then the message will be marked accordingly in the
 * corresponding metadata field (`KafkaMetadata.ExactlyOnceSemantics`). It is then the
 * responsibility of the `KafkaSink` to produce any output messages and commit the offsets
 * for the originally consumed messages within a transaction, using the offset metadata
 * present in the message (importantly including the consumer group id,
 * `KafkaMetadata.ConsumerGroupId`). Releasing a message marked as `ExactlyOnceSemantics`
 * will no-op, since we cannot commit the offset as normally and rely on the KafkaSink to do that.
 */
export class KafkaSource implements IInputSource, IRequireInitialization, IDisposable {
    private done: boolean;
    private logger: ILogger;
    private tracer: Tracer;
    private metrics: IMetrics;
    private consumer: KafkaConsumer;

    constructor(
        private readonly config: IKafkaBrokerConfiguration & IKafkaSubscriptionConfiguration
    ) {
        this.done = false;
        this.logger = DefaultComponentContext.logger;
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        this.consumer = new KafkaConsumer(this.config);
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        await this.consumer.initialize(context);
    }

    public async *start(context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        const messages: AsyncIterableIterator<IRawKafkaMessage> = this.consumer.consume(context);
        for await (let message of messages) {
            message = this.config.preprocessor.process(message);
            this.metrics.increment(KafkaMetrics.MsgReceived, {
                topic: message.topic,
                partition: message.partition,
            });

            const headers = message.headers || {};
            let type: string;
            try {
                const fromHeaders: { [key: string]: any } = {};
                const eventTypeHeaders = headers[this.config.headerNames.eventType];
                if (eventTypeHeaders) {
                    if (Array.isArray(eventTypeHeaders)) {
                        if (eventTypeHeaders.length > 1) {
                            const errStr = `Header contains an array with ${eventTypeHeaders.length} values for ${this.config.headerNames.eventType}, expected only 1`;
                            this.logger.error(errStr);
                            throw new Error(errStr);
                        }
                        type = eventTypeHeaders[0];
                    } else {
                        type = eventTypeHeaders;
                    }
                    fromHeaders[EventSourcedMetadata.EventType] = type;
                }
                let codedMessage: IMessage;
                if (!message.value) {
                    // TODO - return actual message type for the message that was considered a tombstone event instead of overwriting to Tombstone
                    // We do so that we can ensure that the message processing loop sequentially commits offsets for now instead of attempting
                    // to commit offsets directly
                    codedMessage = {
                        type: Tombstone,
                        payload: null,
                    };
                } else {
                    codedMessage = new EncodedMessage(this.config.encoder, type, message.value);
                }
                const seqNumHeader = headers[this.config.headerNames.sequenceNumber];
                if (seqNumHeader) {
                    if (Array.isArray(seqNumHeader)) {
                        if (seqNumHeader.length > 1) {
                            const errStr = `Header contains an array with ${seqNumHeader.length} values for ${this.config.headerNames.sequenceNumber}, expected only 1`;
                            this.logger.error(errStr);
                            throw new Error(errStr);
                        }
                        fromHeaders[EventSourcedMetadata.SequenceNumber] = parseInt(
                            seqNumHeader[0],
                            10
                        );
                    } else {
                        fromHeaders[EventSourcedMetadata.SequenceNumber] = parseInt(
                            seqNumHeader,
                            10
                        );
                    }
                }
                const streamHeader = headers[this.config.headerNames.stream];
                if (streamHeader) {
                    if (Array.isArray(streamHeader)) {
                        if (streamHeader.length > 1) {
                            const errStr = `Header contains an array with ${streamHeader.length} values for ${this.config.headerNames.stream}, expected only 1`;
                            this.logger.error(errStr);
                            throw new Error(errStr);
                        }
                        fromHeaders[EventSourcedMetadata.Stream] = streamHeader[0];
                    } else {
                        fromHeaders[EventSourcedMetadata.Stream] = streamHeader;
                    }
                }
                const dt = headers[this.config.headerNames.timestamp];
                if (dt) {
                    if (typeof dt === "string") {
                        fromHeaders[EventSourcedMetadata.Timestamp] = new Date(parseInt(dt, 10));
                    } else if (Array.isArray(dt)) {
                        if (dt.length > 1) {
                            const errStr = `Header contains an array with ${dt.length} values for ${this.config.headerNames.timestamp}, expected only 1`;
                            this.logger.error(errStr);
                            throw new Error(errStr);
                        }
                        fromHeaders[EventSourcedMetadata.Timestamp] = new Date(parseInt(dt[0], 10));
                    }
                }
                if (this.config.additionalHeaderNames) {
                    const headerKeys: string[] = Object.keys(this.config.additionalHeaderNames);
                    for (const headerKey of headerKeys) {
                        const extraHeader = headers[this.config.additionalHeaderNames[headerKey]];
                        if (extraHeader && !fromHeaders[headerKey]) {
                            fromHeaders[headerKey] = Array.isArray(extraHeader)
                                ? extraHeader
                                : extraHeader;
                        }
                    }
                }
                const metadata: IKafkaMessageMetadata = {
                    ...fromHeaders,
                    [KafkaMetadata.Topic]: message.topic,
                    [KafkaMetadata.Offset]: message.offset,
                    [KafkaMetadata.Partition]: message.partition,
                    [KafkaMetadata.Key]: message.key ? message.key.toString() : message.key,
                    [KafkaMetadata.Timestamp]: new Date(parseInt(message.timestamp, 10)),
                    [KafkaMetadata.ExactlyOnceSemantics]: this.config.eos,
                    [KafkaMetadata.ConsumerGroupId]: this.config.group,
                    [KafkaMetadata.ConsumerGroupEpoch]: this.consumer.epoch,
                };

                const span = this.hydrateSpanContext(message.topic, type, headers);
                const msg = new MessageRef(metadata, codedMessage, span.context());
                // EoS configured KafkaSources no-op on a message release and
                // rely on the KafkaSink to commit offsets for them
                if (!this.config.eos) {
                    msg.once("released", async (msg, _, err): Promise<void> => {
                        const offset: string = msg.metadata(KafkaMetadata.Offset);
                        const topic: string = msg.metadata(KafkaMetadata.Topic);
                        const partition: number = msg.metadata(KafkaMetadata.Partition);
                        const epoch: number = msg.metadata(KafkaMetadata.ConsumerGroupEpoch);

                        if (err || epoch !== this.consumer.epoch) {
                            if (err) {
                                this.logger.error("Unable to release msg", err);
                            } else {
                                this.logger.debug(
                                    "Detected epoch mismatch, not committing offset",
                                    {
                                        offset,
                                        topic,
                                        partition,
                                    }
                                );
                            }

                            failSpan(span, err || new Error("epoch mismatch"));
                            this.metrics.increment(KafkaMetrics.MsgProcessed, {
                                topic,
                                event_type: type,
                                partition,
                                result: KafkaMetricResult.Error,
                            });
                            return;
                        }

                        // TODO - Only commit if above highwater mark
                        this.consumer.addOffsets({
                            topics: [{ topic, partitions: [{ partition, offset }] }],
                        });
                        this.metrics.increment(KafkaMetrics.MsgProcessed, {
                            topic,
                            event_type: type,
                            partition,
                            result: KafkaMetricResult.Success,
                        });
                        span.finish();
                    });
                } else {
                    msg.once("released", async (msg, __, err): Promise<void> => {
                        const topic: string = msg.metadata(KafkaMetadata.Topic);
                        const partition: string = msg.metadata(KafkaMetadata.Partition);
                        const offset: string = msg.metadata(KafkaMetadata.Offset);
                        const epoch: number = msg.metadata(KafkaMetadata.ConsumerGroupEpoch);

                        if (err || epoch !== this.consumer.epoch) {
                            if (err) {
                                this.logger.error("Unable to release msg", err);
                            } else {
                                this.logger.debug(
                                    "Detected epoch mismatch, not committing offset",
                                    {
                                        offset,
                                        topic,
                                        partition,
                                    }
                                );
                            }

                            failSpan(span, err || new Error("epoch mismatch"));
                            this.metrics.increment(KafkaMetrics.MsgProcessed, {
                                topic,
                                event_type: type,
                                partition,
                                result: KafkaMetricResult.Error,
                            });
                            return;
                        }

                        this.metrics.increment(KafkaMetrics.MsgProcessed, {
                            topic,
                            event_type: type,
                            partition,
                            result: KafkaMetricResult.Success,
                        });
                        span.finish();
                    });
                }
                yield msg;
            } catch (e) {
                this.logger.error("received invalid message from Kafka", e, { type });
            }

            if (this.done) {
                break;
            }
        }
    }

    /**
     * Stop consuming messages once the current loop completes
     */
    public async stop(): Promise<void> {
        this.done = true;
        await this.consumer.stop();
    }

    public async dispose(): Promise<void> {
        if (this.consumer) {
            await this.consumer.dispose();
        }
    }

    /**
     * Create span context derived from message headers
     * @param topic Topic name
     * @param message Raw message
     */
    public hydrateSpanContext(topic: string, eventType: string, headers: any): Span {
        const traceHeader = headers[TRACE_HEADER];
        const referenceSpan = traceHeader
            ? this.tracer.extract(FORMAT_HTTP_HEADERS, JSON.parse(traceHeader))
            : undefined;
        const span = this.tracer.startSpan("Consuming Message From Kafka", {
            references: referenceSpan ? [followsFrom(referenceSpan)] : undefined,
        });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-kafka-consumer");
        span.setTag(Tags.PEER_ADDRESS, this.config.broker);
        span.setTag(Tags.MESSAGE_BUS_DESTINATION, topic);
        span.setTag(OpenTracingTagKeys.KafkaTopic, topic);
        span.setTag(OpenTracingTagKeys.EventType, prettyEventName(eventType));
        span.setTag(OpenTracingTagKeys.KafkaAccess, "consume");
        const packageInfo = getRootProjectPackageInfo();
        span.setTag(OpenTracingTagKeys.KafkaService, packageInfo.name);
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        return span;
    }
}
