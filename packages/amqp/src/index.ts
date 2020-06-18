import { IInputSource, IOutputSink, IPublishedMessage } from "@walmartlabs/cookie-cutter-core";
import { AmqpConfiguration } from "./config";
import { config } from "@walmartlabs/cookie-cutter-core";
import { AmqpSource } from "./AmqpSource";
import { AmqpSink } from "./AmqpSink";

export interface IAmqpConfiguration {
    host: string;
    queueName: string;
}

export function amqpSource(configuration: IAmqpConfiguration): IInputSource {
    configuration = config.parse(AmqpConfiguration, configuration, {});

    return new AmqpSource(configuration);
}

export function amqpSink(configuration: IAmqpConfiguration): IOutputSink<IPublishedMessage> {
    configuration = config.parse(AmqpConfiguration, configuration, {});

    return new AmqpSink(configuration);
}
