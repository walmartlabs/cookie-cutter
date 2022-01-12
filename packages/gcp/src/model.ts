/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export const AttributeNames = {
    eventType: "eventType",
    timestamp: "dt",
    contentType: "mimeType",
};

export enum PubSubMetricResults {
    Success = "success",
    Error = "error",
}

export enum PubSubMetrics {
    MsgPublished = "cookie_cutter.pubsub_sink.msg_published",
    MsgSubscribed = "cookie_cutter.pubsub_source.msg_received",
}

export enum PubSubOpenTracingTagKeys {
    TopicName = "pubSub.topic",
    SubscriberName = "pubSub.subscription_name",
}
