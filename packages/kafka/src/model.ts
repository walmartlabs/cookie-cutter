/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMetadata } from "@walmartlabs/cookie-cutter-core";
import * as ot from "opentracing";
import { KafkaMetadata } from ".";

export interface IMessageHeaders {
    [key: string]: string | string[];
}

export interface IRawKafkaMessage {
    topic: string;
    partition: number;
    offset: string;
    key: Buffer;
    value: Buffer | null;
    timestamp: string;
    headers: IMessageHeaders;
}

export interface IKafkaMessageMetadata extends IMetadata {
    [KafkaMetadata.Topic]: string;
    [KafkaMetadata.Offset]: string;
    [KafkaMetadata.Partition]: number;
    [KafkaMetadata.Key]: string | Buffer;
    /**
     * Whether this message should participate in a transaction
     */
    [KafkaMetadata.ExactlyOnceSemantics]: boolean;
    /**
     * Consumer group id of consumer that fetched this message
     */
    [KafkaMetadata.ConsumerGroupId]: string;
}

export interface IProducerMessage<T> {
    key: Buffer | null;
    payload: T;
    topic: string;
    timestamp: string;
    headers?: IMessageHeaders;
    partition?: number | string;
    context?: ot.SpanContext;
}
/**
 * Header field for open tracing trace
 */
export const TRACE_HEADER = "X-Trace";

export interface IOffsetTracker {
    /**
     * Topic
     */
    [key: string]: {
        /**
         * Consumer id
         */
        [key: string]: {
            /**
             * Partition: Offset
             */
            [key: number]: string;
        };
    };
}

export enum KafkaOpenTracingTagKeys {
    Broker = "kafka.broker",
    Topic = "kafka.topic",
}
