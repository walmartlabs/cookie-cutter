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

export interface IAmqpServerConfig {
    host: string;
    port?: number;
}

export interface IAmqpQueueConfig {
    readonly queueName: string;
    readonly durable?: boolean;
}

export interface IAmqpMessageConfig {
    expiration?: number;
}

export interface IAmqpConfiguration {
    readonly server?: IAmqpServerConfig;
    readonly queue: IAmqpQueueConfig;
    readonly message?: IAmqpMessageConfig;
    readonly encoder: IMessageEncoder;
}

export function amqpSource(configuration: IAmqpConfiguration): IInputSource {
    configuration = config.parse(AmqpConfiguration, configuration, {
        server: { host: "localhost", port: 5672 },
        queue: { queueName: "defaultQueueName", durable: true },
        encoder: new JsonMessageEncoder(),
    });

    return new AmqpSource(configuration);
}

export function amqpSink(configuration: IAmqpConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(AmqpConfiguration, configuration, {
        server: { host: "localhost", port: 5672 },
        queue: { queueName: "defaultQueueName", durable: true },
        encoder: new JsonMessageEncoder(),
    });

    return new AmqpSink(configuration);
}
