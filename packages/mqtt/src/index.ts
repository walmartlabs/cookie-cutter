/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    IInputSource,
    IMessageEncoder,
    IOutputSink,
    IPublishedMessage,
} from "@walmartlabs/cookie-cutter-core";
import { MQTTPublisherConfiguration, MQTTSubscriberConfiguration } from "./config";
import { MqttPublisherSink } from "./MqttSink";
import { QoS } from "mqtt";
import { MqttSubscriberSource } from "./MqttSource";

export enum MqttMetadata {
    topic = "topic",
}

export interface IMqttMessage {
    attributes: {
        [key: string]: string;
    };
    data: Buffer;
}
export interface IMqttPreprocessor {
    process(payload: any): IMqttMessage;
}

export interface IMqttAuthConfig {
    readonly hostName: string;
    readonly hostPort?: number;
    readonly username?: string;
    readonly password?: string;
}

export interface IMqttPublisherConfiguration {
    readonly encoder: IMessageEncoder;
    readonly defaultTopic: string;
    readonly qos?: QoS;
}

export interface IMqttSubscriberConfiguration {
    readonly preprocessor?: IMqttPreprocessor;
    readonly encoder: IMessageEncoder;
    readonly queueSize?: number;
    readonly topic: string | string[];
    readonly qos?: QoS;
}

export function mqttSink(
    configuration: IMqttAuthConfig & IMqttPublisherConfiguration
): IOutputSink<IPublishedMessage> {
    configuration = config.parse(MQTTPublisherConfiguration, configuration, {
        hostPort: 1883,
        qos: 0,
    });

    return new MqttPublisherSink(configuration);
}

export function mqttSource(
    configuration: IMqttAuthConfig & IMqttSubscriberConfiguration
): IInputSource {
    configuration = config.parse(MQTTSubscriberConfiguration, configuration, {
        hostPort: 1883,
        queueSize: 10,
        qos: 0,
    });

    return new MqttSubscriberSource(configuration);
}
