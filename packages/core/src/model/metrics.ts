/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage } from "./message";

export interface IMetricTags {
    readonly [key: string]: any;
}

export interface IMetrics {
    increment(key: string, tags?: IMetricTags): void;
    increment(key: string, value: number, tags?: IMetricTags): void;
    gauge(key: string, value: number, tags?: IMetricTags): void;
    timing(key: string, value: number, tags?: IMetricTags): void;
}

export enum MessageProcessingMetrics {
    Received = "cookie_cutter.core.received",
    Processed = "cookie_cutter.core.processed",
    Store = "cookie_cutter.core.store",
    Publish = "cookie_cutter.core.publish",
    OutputBatch = "cookie_cutter.core.output_batch",
    InputQueue = "cookie_cutter.core.input_queue",
    OutputQueue = "cookie_cutter.core.output_queue",
    ConcurrentHandlers = "cookie_cutter.core.concurrent_handlers",
}

export enum MessageProcessingResults {
    Success = "success",
    Error = "error",
    ErrSeqNum = "error.seq_num",
    ErrTooManyRequests = "error.too_many_requests",
    ErrInvalidMsg = "error.invalid_msg",
    ErrFailedMsgProcessing = "error.failed_msg_processing",
    ErrFailedMsgRelease = "error.failed_msg_release",
    ErrReprocessing = "error.reprocessing",
    Unhandled = "unhandled",
}

export interface IMessageMetricAnnotator {
    annotate(msg: IMessage): IMetricTags;
}
