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
    ILogger,
    IComponentContext,
    DefaultComponentContext,
} from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";
import * as amqp from "amqplib";

export class AmqpSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    private logger: ILogger;
    private conn: amqp.Connection;
    private channel: amqp.Channel;

    constructor(private config: IAmqpConfiguration) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
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

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        for (const msg of output) {
            const payload = Buffer.from(this.config.encoder.encode(msg.message));
            this.channel.sendToQueue(this.config.queue.queueName, payload, {
                persistent: true,
                type: msg.message.type,
                expiration: this.config.message ? this.config.message.expiration : undefined,
            });
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }

    public async dispose(): Promise<void> {
        if (this.conn) {
            await this.conn.close(); // also closes channel
        }
    }
}
