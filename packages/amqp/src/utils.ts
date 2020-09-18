import { IAmqpServerConfig } from ".";
import * as amqp from "amqplib";
export function getAmqpConnectionConfig(config: IAmqpServerConfig): amqp.Options.Connect {
    const options: amqp.Options.Connect = {
        protocol: "amqp",
        hostname: config.host,
        port: config.port,
    };

    // specify username and password only when provided in config to avoid overwriting the defaults
    if (config.username) {
        return {
            ...options,
            username: config.username,
            password: config.password, 
        };
    }
    return options;
}
