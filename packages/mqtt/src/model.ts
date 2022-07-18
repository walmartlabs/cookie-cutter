/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export enum AttributeNames {
    eventType = "eventType",
    timestamp = "dt",
    contentType = "mimeType",
}

export enum MQTTOpenTracingTagKeys {
    topic = "mqtt.topic",
}

export enum MqttMetricResults {
    success = "success",
    error = "error",
}

export enum MqttMetrics {
    MsgPublished = "cookie_cutter.mqtt_sink.msg_published",
    MsgReceived = "cookie_cutter.mqtt_source.msg_received",
    MsgProcessed = "cookie_cutter.mqtt_source.msg_processed",
}
