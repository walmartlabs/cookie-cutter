import { config, IMessageEncoder } from "@walmartlabs/cookie-cutter-core";
import { IAmqpConfiguration } from ".";

@config.section
export class AmqpConfiguration implements IAmqpConfiguration {
    @config.field(config.converters.string)
    public set host(_: string) {
        config.noop();
    }
    public get host(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set queueName(_: string) {
        config.noop();
    }
    public get queueName(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set encoder(_: IMessageEncoder) {
        config.noop();
    }
    public get encoder(): IMessageEncoder {
        return config.noop();
    }
}
