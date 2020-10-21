/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IInputSource,
    IOutputSink,
    IPublishedMessage,
    IMessageEncoder,
    JsonMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { AmqpConfiguration } from "./config";
import { config } from "@walmartlabs/cookie-cutter-core";
import { AmqpSource } from "./AmqpSource";
import { AmqpSink } from "./AmqpSink";

export enum AmqpMetadata {
    QueueName = "amqp.queue_name",
    Redelivered = "amqp.redelivered",
    Expiration = "amqp.expiration",
}

export enum AmqpOpenTracingTagKeys {
    QueueName = "amqp.queue_name",
}

export interface IAmqpServerConfig {
    readonly host: string;
    readonly port?: number;
    readonly username?: string;
    readonly password?: string;
    readonly vhost?: string;
}

export interface IAmqpQueueConfig {
    readonly name: string;
    readonly durable?: boolean;
}

export interface IAmqpMessageConfig {
    readonly expiration?: number;
}

export interface IAmqpConfiguration {
    readonly server: IAmqpServerConfig;
    readonly queue: IAmqpQueueConfig;
    readonly message?: IAmqpMessageConfig;
    readonly encoder: IMessageEncoder;
}

export function amqpSource(configuration: IAmqpConfiguration): IInputSource {
    configuration = config.parse(AmqpConfiguration, configuration, {
        queue: { name: "defaultQueueName", durable: true },
        encoder: new JsonMessageEncoder(),
    });

    return new AmqpSource(configuration);
}

export function amqpSink(configuration: IAmqpConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(AmqpConfiguration, configuration, {
        queue: { name: "defaultQueueName", durable: true },
        encoder: new JsonMessageEncoder(),
    });

    return new AmqpSink(configuration);
}
