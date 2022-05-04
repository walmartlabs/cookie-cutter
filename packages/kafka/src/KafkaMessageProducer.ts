/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    failSpan,
    IComponentContext,
    ILogger,
    IMetrics,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import * as kafkajs from "kafkajs";
import { FORMAT_HTTP_HEADERS, Span, Tags, Tracer } from "opentracing";
import * as uuid from "uuid";
import {
    IKafkaBrokerConfiguration,
    IKafkaPublisherConfiguration,
    KafkaPublisherCompressionMode,
} from ".";
import { IProducerMessage, TRACE_HEADER } from "./model";
import { loadCompressionPlugins } from "./utils";

loadCompressionPlugins();

enum KafkaMetrics {
    MsgPublished = "cookie_cutter.kafka_producer.msg_published",
}
enum KafkaMetricResults {
    Success = "success",
    Error = "error",
}

type Message = { type: string } & IProducerMessage<Buffer>;

namespace CompressionTypes {
    /** Maps our wrapper enum onto the kafkajs enum for compression types. */
    export const fromCompressionMode = (
        mode: KafkaPublisherCompressionMode
    ): kafkajs.CompressionTypes => {
        switch (mode) {
            case KafkaPublisherCompressionMode.None:
                return kafkajs.CompressionTypes.None;
            case KafkaPublisherCompressionMode.Gzip:
                return kafkajs.CompressionTypes.GZIP;
            case KafkaPublisherCompressionMode.Snappy:
                return kafkajs.CompressionTypes.Snappy;
            case KafkaPublisherCompressionMode.LZ4:
                return kafkajs.CompressionTypes.LZ4;
            default:
                throw new Error("Unknown KafkaPublisherCompressionMode");
        }
    };
}

/**
 * Wrapper class to produce messages using KafkaJS
 */
export class KafkaMessageProducer {
    private tracer: Tracer;
    private logger: ILogger;
    private metrics: IMetrics;

    constructor(
        ctx: IComponentContext,
        private readonly config: IKafkaBrokerConfiguration & IKafkaPublisherConfiguration
    ) {
        this.tracer = ctx.tracer;
        this.logger = ctx.logger;
        this.metrics = ctx.metrics;
    }

    /**
     * Send messages using the configured "sender" (producer or transaction)
     */
    public async sendMessages(
        messages: Message[],
        topic: string,
        acks: number,
        sendWith: kafkajs.Transaction | kafkajs.Producer,
        compressionMode: KafkaPublisherCompressionMode
    ) {
        const spans: Span[] = [];
        try {
            const batchId = uuid.v4();
            for (const msg of messages) {
                const span = this.createSpanForTopic(msg, batchId, topic);
                this.injectTraceIntoHeaders(span, msg);
                spans.push(span);
            }
            await sendWith.send({
                acks,
                topic,
                compression: CompressionTypes.fromCompressionMode(compressionMode),
                messages: messages.map((message) => ({
                    ...message,
                    // partition's type is number in kafkajs but since we've updated
                    // our default partitioner to accept string types we coerce this value
                    // to any in order to satisfy the original type def.
                    partition: message.partition as any,
                    value: message.payload,
                })),
            });
            this.emitMetrics(messages, KafkaMetricResults.Success);
        } catch (e) {
            spans.map((span) => failSpan(span, e));
            this.logger.error("failed to send message to Kafka broker", e, {
                messages: messages.map((m) => {
                    return { type: m.type, topic: m.topic };
                }),
            });
            this.emitMetrics(messages, KafkaMetricResults.Error);
            throw e;
        } finally {
            spans.map((span) => span.finish());
        }
    }

    private emitMetrics(messages: Message[], result: KafkaMetricResults) {
        for (const msg of messages) {
            this.metrics.increment(KafkaMetrics.MsgPublished, {
                topic: msg.topic,
                event_type: msg.payload ? msg.type : "Tombstone",
                partition: msg.partition,
                result,
            });
        }
    }
    private injectTraceIntoHeaders(span: Span, msg: Message): void {
        const holder = {};
        this.tracer.inject(span, FORMAT_HTTP_HEADERS, holder);
        msg.headers[TRACE_HEADER] = JSON.stringify(holder);
    }

    private createSpanForTopic(msg: Message, batchId: string, topic: string): Span {
        const span = this.tracer.startSpan(
            `Publishing Batch Messages To Kafka ${topic}: ${batchId}`,
            {
                childOf: msg.context,
            }
        );
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_PRODUCER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-kafka-producer");
        span.setTag(Tags.PEER_ADDRESS, this.config.broker);
        span.setTag(Tags.MESSAGE_BUS_DESTINATION, topic);
        span.setTag(OpenTracingTagKeys.KafkaTopic, topic);
        span.setTag(OpenTracingTagKeys.KafkaBroker, this.config.broker);
        span.setTag(OpenTracingTagKeys.EventType, msg.type);
        span.setTag(OpenTracingTagKeys.BatchId, batchId);
        span.setTag(OpenTracingTagKeys.KafkaAccess, "send");
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        return span;
    }
}
