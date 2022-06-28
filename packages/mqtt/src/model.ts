import { SpanContext } from "opentracing";

export enum AttributeNames {
    eventType = "eventType",
    timestamp = "dt",
    contentType = "mimeType",
}

export enum MQTTOpenTracingTagKeys {
    topic = "mqtt.topic",
}

export interface IPayloadWithAttributes {
    payload: Buffer;
    attributes: {
        [key: string]: string;
    };
    spanContext: SpanContext;
}

export enum MqttMetricResults {
    success = "success",
    error = "error",
}

export enum MqttMetrics {
    MsgPublished = "cookie_cutter.mqtt_sink.msg_published",
    MsgReceived = "cookie_cutter.mqtt_source.msg_received",
}
