/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    BoundedPriorityQueue,
    DefaultComponentContext,
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    IDisposable,
    IInputSource,
    ILogger,
    IMessage,
    IMetadata,
    IMetrics,
    IRequireInitialization,
    isEmbeddable,
    MessageRef,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import { IMqttAuthConfig, IMqttMessage, IMqttSubscriberConfiguration, MqttMetadata } from ".";
import * as mqtt from "mqtt";
import { Span, Tags, Tracer } from "opentracing";
import { AttributeNames, MqttMetricResults, MqttMetrics, MQTTOpenTracingTagKeys } from "./model";

export class MqttSubscriberSource implements IInputSource, IRequireInitialization, IDisposable {
    private done: boolean = false;
    private client: mqtt.Client;
    private tracer: Tracer;
    private logger: ILogger;
    private metrics: IMetrics;
    private readonly queue: BoundedPriorityQueue<MessageRef>;
    private readonly spanOperationName: string = "Received MQTT message from broker";
    private readonly spanTagComponent: string = "cookie-cutter-mqtt";

    public constructor(private readonly config: IMqttAuthConfig & IMqttSubscriberConfiguration) {
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;

        this.queue = new BoundedPriorityQueue<MessageRef>(this.config.queueSize);
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
            this.logger.info("Subscriber made connection to server", {
                cmd: packet.cmd,
                returnCode: packet.returnCode,
                reasonCode: packet.reasonCode,
            });

            this.client.subscribe(this.config.topic, { qos: this.config.qos });
        });

        this.client.on("error", (error: Error) => {
            this.queue.close();
            throw error;
        });
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.client.on("message", async (topic: string, payload: Buffer) => {
            this.metrics.increment(MqttMetrics.MsgReceived, {
                hostName: this.config.hostName,
                port: this.config.hostPort,
                topic: this.config.topic,
            });

            const { attributes, data } = this.config.preprocessor
                ? this.config.preprocessor.process(payload)
                : (JSON.parse(payload.toString()) as IMqttMessage);
            const eventType: any = attributes[AttributeNames.eventType];

            const msg: IMessage = this.decode(data, eventType);

            const span: Span = this.tracer.startSpan(this.spanOperationName, {
                childOf: undefined,
            });

            this.spanLogAndSetTags(span, this.start.name);

            const metadata: IMetadata = {
                [EventSourcedMetadata.EventType]: eventType,
                [EventSourcedMetadata.Timestamp]: attributes[AttributeNames.timestamp],
                [MqttMetadata.topic]: topic,
            };

            const msgRef: MessageRef = new MessageRef(metadata, msg, span.context());

            msgRef.once(
                "released",
                async (_msg: MessageRef, _value?: any, error?: Error): Promise<void> => {
                    try {
                        if (error) {
                            this.logger.error("Unable to release message", error, {
                                topic,
                                port: this.config.hostPort,
                                hostName: this.config.hostName,
                            });
                            this.emitMetrics(eventType, MqttMetricResults.error);
                            failSpan(span, error);
                        } else {
                            this.logger.debug("Message processed", {
                                topic,
                                port: this.config.hostPort,
                                hostName: this.config.hostName,
                            });
                            this.emitMetrics(eventType, MqttMetricResults.success);
                        }
                    } finally {
                        span.finish();
                    }
                }
            );

            if (!this.done) {
                await this.queue.enqueue(msgRef);
            }
        });

        yield* this.queue.iterate();
    }

    private emitMetrics(eventType: any, result: string): void {
        this.metrics.increment(MqttMetrics.MsgProcessed, {
            topic: this.config.topic.toString(),
            eventType,
            port: this.config.hostPort,
            hostName: this.config.hostName,
            result,
        });
    }

    private spanLogAndSetTags(span: Span, funcName: string): void {
        span.log({ topic: this.config.topic.toString() });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_MESSAGING_CONSUMER);
        span.setTag(Tags.COMPONENT, this.spanTagComponent);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(MQTTOpenTracingTagKeys.topic, this.config.topic.toString());
    }

    private decode(payload: any, eventType: string): IMessage {
        if (isEmbeddable(this.config.encoder)) {
            return this.config.encoder.decode(
                this.config.encoder.fromJsonEmbedding(payload),
                eventType
            );
        }

        return this.config.encoder.decode(payload, eventType);
    }

    public async stop(): Promise<void> {
        this.done = true;
        this.queue.close();
    }

    public async dispose(): Promise<void> {
        this.client.unsubscribe(this.config.topic);
        this.client.removeAllListeners();
        this.client.end(true);
    }
}
