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
    IMetrics,
} from "@walmartlabs/cookie-cutter-core";
import { AmqpMetadata, AmqpOpenTracingTagKeys, IAmqpConfiguration } from ".";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import * as amqp from "amqplib";

enum AmqpMetrics {
    UnassignedMessageCount = "cookie_cutter.amqp_consumer.unassigned_message_count",
    ConsumerCount = "cookie_cutter.amqp_consumer.consumer_count",
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
    private running: boolean;
    private loop: NodeJS.Timer;

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
            hostname: this.config.server.host,
            port: this.config.server.port,
            username: this.config.server.username,
            password: this.config.server.password,
            vhost: this.config.server.vhost,
        };
        this.conn = await amqp.connect(options);
        this.channel = await this.conn.createChannel();
        const queueName = this.config.queue.name;
        const durable = this.config.queue.durable;
        await this.channel.assertQueue(queueName, { durable });
        this.channel.prefetch(50);
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.running = true;
        // tslint:disable-next-line:no-floating-promises
        this.loopAmqpQueueUnassignedMessageCount();
        const queueName = this.config.queue.name;
        const host = this.config.server.host;
        const onMessage = async (msg: amqp.ConsumeMessage) => {
            const event_type = msg.properties.type;
            const span = this.tracer.startSpan("Consuming Message For AMQP", {
                childOf: undefined,
            });
            this.spanLogAndSetTags(span, queueName);
            if (msg !== null) {
                this.metrics.increment(AmqpMetrics.MsgReceived, {
                    host,
                    queueName,
                    event_type,
                });
                const metadata: IMetadata = {
                    [AmqpMetadata.QueueName]: queueName,
                    [AmqpMetadata.Redelivered]: msg.fields.redelivered,
                    [AmqpMetadata.Expiration]: msg.properties.expiration,
                };
                const codedMessage: IMessage = new EncodedMessage(
                    this.config.encoder,
                    event_type,
                    msg.content
                );
                const msgRef = new MessageRef(metadata, codedMessage, new SpanContext());
                await this.pipe.enqueue(msgRef);
                let result = AmqpMetricResult.Error;
                msgRef.once("released", async (_, err) => {
                    try {
                        if (!err) {
                            this.channel.ack(msg);
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
                            host,
                            queueName,
                            event_type,
                            result,
                        });
                    }
                });
            }
        };
        await this.channel.consume(this.config.queue.name, onMessage, { noAck: false });
        yield* this.pipe.iterate();
    }

    private spanLogAndSetTags(span: Span, queueName): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-amqp");
        span.setTag(Tags.PEER_SERVICE, "RabbitMQ");
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        span.setTag(AmqpOpenTracingTagKeys.QueueName, queueName);
    }

    private loopAmqpQueueUnassignedMessageCount = async () => {
        if (this.running) {
            const queueName = this.config.queue.name;
            try {
                const queueMetadata = await this.channel.checkQueue(queueName);
                this.metrics.gauge(AmqpMetrics.UnassignedMessageCount, queueMetadata.messageCount, {
                    host: this.config.server.host,
                    queueName,
                });
                this.metrics.gauge(AmqpMetrics.ConsumerCount, queueMetadata.consumerCount, {
                    host: this.config.server.host,
                    queueName,
                });
            } catch (e) {
                this.logger.warn("AmqpSource|Failed to checkQueue", { queueName });
            }
            if (this.running) {
                this.loop = setTimeout(this.loopAmqpQueueUnassignedMessageCount, 1000);
            }
        }
    };

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close(); // also closes channel
        }
    }

    public async stop(): Promise<void> {
        this.running = false;
        if (this.loop) {
            clearTimeout(this.loop);
        }
        this.pipe.close();
    }
}
