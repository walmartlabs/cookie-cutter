/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IDisposable,
    ILogger,
    IMetrics,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    OpenTracingTagKeys,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import { IMqttAuthConfig, IMqttMessage, IMqttPublisherConfiguration, MqttMetadata } from ".";
import * as mqtt from "mqtt";
import { Span, Tags, Tracer } from "opentracing";
import { AttributeNames, MqttMetricResults, MqttMetrics, MQTTOpenTracingTagKeys } from "./model";

/*
    A MQTT publisher client that publishes messages to a broker
*/
export class MqttPublisherSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable
{
    private client: mqtt.MqttClient;
    private tracer: Tracer;
    private logger: ILogger;
    private metrics: IMetrics;
    private readonly spanOperationName: string = "Publish to MQTT broker";
    private readonly spanTagComponent: string = "cookie-cutter-mqtt";

    public constructor(private readonly config: IMqttAuthConfig & IMqttPublisherConfiguration) {
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.logger = context.logger;
        this.metrics = context.metrics;

        this.client = mqtt.connect({
            port: this.config.hostPort,
            hostname: this.config.hostName,
            username: this.config.username,
            password: this.config.password,
        });

        this.client.on("connect", (packet: mqtt.IConnackPacket) => {
            this.logger.info("Publisher made connection to server", {
                cmd: packet.cmd,
                returnCode: packet.returnCode,
                reasonCode: packet.reasonCode,
            });
        });

        this.client.on("error", (error: Error) => {
            throw error;
        });
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        for (const message of output) {
            const formattedMsg: IMqttMessage = this.formattedMessage(message);
            const topic: string = message.metadata[MqttMetadata.topic] || this.config.defaultTopic;

            if (!topic) {
                throw new Error(
                    "This message does not have a topic/default topic to be published to!"
                );
            }

            this.client.publish(
                topic,
                Buffer.from(JSON.stringify(formattedMsg)),
                { qos: this.config.qos },
                (error: Error) => {
                    const span: Span = this.tracer.startSpan(this.spanOperationName, {
                        childOf: message.spanContext,
                    });

                    this.spanLogAndSetTags(span, this.sink.name, topic);

                    if (error) {
                        this.logger.error("Writing message to broker failed", {
                            message,
                            error,
                            topic,
                            hostName: this.config.hostName,
                            hostPort: this.config.hostPort,
                        });

                        this.emitMetrics(
                            topic,
                            formattedMsg.attributes[AttributeNames.eventType],
                            MqttMetricResults.error
                        );
                        failSpan(span, error);
                    } else {
                        this.emitMetrics(
                            topic,
                            formattedMsg.attributes[AttributeNames.eventType],
                            MqttMetricResults.success
                        );

                        this.logger.debug("Message published to broker", {
                            topic,
                            hostName: this.config.hostName,
                            hostPort: this.config.hostPort,
                        });
                    }

                    span.finish();
                }
            );
        }
    }

    private emitMetrics(topic: string, eventType: string, result: string): void {
        this.metrics.increment(MqttMetrics.MsgPublished, {
            topic,
            eventType,
            result,
        });
    }

    private formattedMessage(message: IPublishedMessage): IMqttMessage {
        const timestamp: string = Date.now().toString();
        const data: Buffer = Buffer.from(this.config.encoder.encode(message.message));
        const attributes: any = {
            [AttributeNames.timestamp]: timestamp,
            [AttributeNames.eventType]: message.message.type,
            [AttributeNames.contentType]: this.config.encoder.mimeType,
        };

        return {
            data,
            attributes,
        };
    }

    private spanLogAndSetTags(span: Span, funcName: string, topic: string): void {
        span.log({ topic });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_PRODUCER);
        span.setTag(Tags.COMPONENT, this.spanTagComponent);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(MQTTOpenTracingTagKeys.topic, topic);
    }

    public async dispose(): Promise<void> {
        this.client.removeAllListeners();
        this.client.end(true);
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.None,
            idempotent: false,
        };
    }
}
