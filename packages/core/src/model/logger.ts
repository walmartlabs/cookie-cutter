/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export interface ILoggerStructuredData {
    [key: string]: any;
}

export interface ILogger {
    info(message: string, data?: ILoggerStructuredData): void;
    debug(message: string, data?: ILoggerStructuredData): void;
    warn(message: string, data?: ILoggerStructuredData): void;
    error(message: string, err?: any, data?: ILoggerStructuredData): void;
}

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}
