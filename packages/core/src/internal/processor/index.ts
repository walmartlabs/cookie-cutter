/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IConcurrencyConfiguration } from "../../model";
import { ConcurrentMessageProcessor } from "./ConcurrentMessageProcessor";
import { IMessageProcessor, IMessageProcessorConfiguration } from "./IMessageProcessor";
import { RpcMessageProcessor } from "./RpcMessageProcessor";
import { SerialMessageProcessor } from "./SerialMessageProcessor";

export * from "./IMessageProcessor";

export function createSerialMessageProcessor(
    config: IMessageProcessorConfiguration
): IMessageProcessor {
    return new SerialMessageProcessor(config);
}

export function createConcurrentMessageProcessor(
    concurrencyConfig: IConcurrencyConfiguration,
    config: IMessageProcessorConfiguration
): IMessageProcessor {
    return new ConcurrentMessageProcessor(concurrencyConfig, config);
}

export function createRpcMessageProcessor(
    concurrencyConfig: IConcurrencyConfiguration,
    config: IMessageProcessorConfiguration
): IMessageProcessor {
    return new RpcMessageProcessor(concurrencyConfig, config);
}
