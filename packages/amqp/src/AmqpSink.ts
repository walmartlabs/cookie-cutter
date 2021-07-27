/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    OutputSinkConsistencyLevel,
    IRequireInitialization,
    IDisposable,
    IComponentContext,
    DefaultComponentContext,
    failSpan,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { AmqpOpenTracingTagKeys, IAmqpConfiguration } from ".";
import * as amqp from "amqplib";
import { Span, Tags, Tracer } from "opentracing";

// tslint:disable:no-console
export class AmqpSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    private tracer: Tracer;
    private conn: amqp.Connection;
    private channel: amqp.Channel;

    constructor(private config: IAmqpConfiguration) {
        this.tracer = DefaultComponentContext.tracer;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        console.log("sink init start");
        this.tracer = context.tracer;
        // note: username and password are set to default amqp credentials(guest) by underlying library if not set or set to undefined
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
        console.log("sink init end");
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        for (const msg of output) {
            console.log("sink sink msg start");
            const span = this.tracer.startSpan("Producing Message For AMQP", {
                childOf: msg.spanContext,
            });
            this.spanLogAndSetTags(span, this.sink.name);
            const payload = Buffer.from(this.config.encoder.encode(msg.message));
            try {
                console.log("sink sendToQueue start");
                this.channel.sendToQueue(this.config.queue.name, payload, {
                    persistent: true,
                    type: msg.message.type,
                    contentType: this.config.encoder.mimeType,
                    expiration: this.config.message ? this.config.message.expiration : undefined,
                });
                console.log("sink sendToQueue end");
            } catch (e) {
                console.log("sink sink catch: ", e);
                failSpan(span, e);
                throw e;
            } finally {
                span.finish();
            }
            console.log("sink sink msg end");
        }
    }

    private spanLogAndSetTags(span: Span, funcName: string): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_PRODUCER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-amqp");
        span.setTag(Tags.PEER_SERVICE, "RabbitMQ");
        span.setTag(Tags.SAMPLING_PRIORITY, 1);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(AmqpOpenTracingTagKeys.QueueName, this.config.queue.name);
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            console.log("sink dispose conn.close before");
            await this.conn.close(); // also closes channel
            console.log("sink dispose conn.close after");
        }
    }
}
