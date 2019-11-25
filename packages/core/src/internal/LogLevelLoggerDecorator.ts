/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger, ILoggerStructuredData, LogLevel } from "../model";

export class LogLevelLoggerDecorator implements ILogger {
    constructor(private readonly logger: ILogger, private readonly level: LogLevel) {}

    public info(message: string, data?: ILoggerStructuredData): void {
        if (this.level <= LogLevel.Info) {
            this.logger.info(message, data);
        }
    }

    public debug(message: string, data?: ILoggerStructuredData): void {
        if (this.level <= LogLevel.Debug) {
            this.logger.debug(message, data);
        }
    }

    public warn(message: string, data?: ILoggerStructuredData): void {
        if (this.level <= LogLevel.Warn) {
            this.logger.warn(message, data);
        }
    }

    public error(message: string, err?: any, data?: ILoggerStructuredData): void {
        if (this.level <= LogLevel.Error) {
            this.logger.error(message, err, data);
        }
    }
}
