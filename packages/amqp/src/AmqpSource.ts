/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IInputSource,
    MessageRef,
    IMetadata,
    IComponentContext,
    IRequireInitialization,
    IDisposable,
    BoundedPriorityQueue,
    ILogger,
    DefaultComponentContext,
    EncodedMessage,
    IMessage,
    failSpan,
    OpenTracingTagKeys,
    IMetrics,
} from "@walmartlabs/cookie-cutter-core";
import { AmqpOpenTracingTagKeys, IAmqpConfiguration } from ".";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import * as amqp from "amqplib";

enum AmqpMetrics {
    MsgReceived = "cookie_cutter.amqp_consumer.input_msg_received",
    MsgProcessed = "cookie_cutter.amqp_consumer.input_msg_processed",
}
enum AmqpMetricResult {
    Success = "success",
    Error = "error",
}

export class AmqpSource implements IInputSource, IRequireInitialization, IDisposable {
    private pipe = new BoundedPriorityQueue<MessageRef>(100);
    private logger: ILogger;
    private metrics: IMetrics;
    private tracer: Tracer;
    private conn: amqp.Connection;
    private channel: amqp.Channel;

    constructor(private config: IAmqpConfiguration) {
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
        this.tracer = DefaultComponentContext.tracer;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        this.metrics = context.metrics;
        this.tracer = context.tracer;
        const options: amqp.Options.Connect = {
            protocol: "amqp",
            hostname: this.config.server!.host,
            port: this.config.server!.port,
        };
        this.conn = await amqp.connect(options);
        this.channel = await this.conn.createChannel();
        const queueName = this.config.queue.queueName;
        const durable = this.config.queue.durable;
        const ok = await this.channel.assertQueue(queueName, { durable });
        this.logger.info("assertQueue", ok);
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        const getMsg = async (msg: amqp.ConsumeMessage) => {
            const span = this.tracer.startSpan("Consuming Message For AMQP", {
                childOf: undefined,
            });
            this.spanLogAndSetTags(span, "getMsg", this.config.queue.queueName);
            if (msg !== null) {
                this.metrics.increment(AmqpMetrics.MsgReceived, {
                    host: this.config.server.host,
                    queueName: this.config.queue.queueName,
                    event_type: msg.properties.type,
                });
                const metadata: IMetadata = {};
                const codedMessage: IMessage = new EncodedMessage(
                    this.config.encoder,
                    msg.properties.type,
                    msg.content
                );
                const msgRef = new MessageRef(metadata, codedMessage, new SpanContext());
                await this.pipe.enqueue(msgRef);
                let result = AmqpMetricResult.Error;
                const ch = this.channel;
                msgRef.once("released", async (_, err) => {
                    try {
                        if (!err) {
                            ch.ack(msg);
                            result = AmqpMetricResult.Success;
                        } else {
                            failSpan(span, err);
                        }
                    } catch (e) {
                        failSpan(span, e);
                        throw e;
                    } finally {
                        span.finish();
                        this.metrics.increment(AmqpMetrics.MsgProcessed, {
                            host: this.config.server.host,
                            queueName: this.config.queue.queueName,
                            event_type: msg.properties.type,
                            result,
                        });
                    }
                });
            }
        };
        await this.channel.consume(this.config.queue.queueName, getMsg, { noAck: false });
        yield* this.pipe.iterate();
    }

    private spanLogAndSetTags(span: Span, funcName: string, queueName): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-amqp");
        span.setTag(Tags.PEER_SERVICE, "RabbitMQ");
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(AmqpOpenTracingTagKeys.QueueName, queueName);
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close(); // also closes channel
        }
    }

    public async stop(): Promise<void> {
        this.pipe.close();
    }
}
