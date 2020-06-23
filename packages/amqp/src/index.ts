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
} from "@walmartlabs/cookie-cutter-core";
import { AmqpConfiguration } from "./config";
import { config } from "@walmartlabs/cookie-cutter-core";
import { AmqpSource } from "./AmqpSource";
import { AmqpSink } from "./AmqpSink";

export interface IAmqpConfiguration {
    readonly host: string;
    readonly port?: number;
    readonly queueName: string;
    readonly encoder: IMessageEncoder;
}

export function amqpSource(configuration: IAmqpConfiguration): IInputSource {
    configuration = config.parse(AmqpConfiguration, configuration);

    return new AmqpSource(configuration);
}

export function amqpSink(configuration: IAmqpConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(AmqpConfiguration, configuration);

    return new AmqpSink(configuration);
}
