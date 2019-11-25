/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger, ILoggerStructuredData } from "../model";

export class ConsoleLogger implements ILogger {
    public info(message: string, data?: ILoggerStructuredData): void {
        this.log("INFO", message, data || {});
    }

    public debug(message: string, data?: ILoggerStructuredData): void {
        this.log("DEBUG", message, data || {});
    }

    public warn(message: string, data?: ILoggerStructuredData): void {
        this.log("WARN", message, data || {});
    }

    public error(message: string, err?: any, data?: ILoggerStructuredData): void {
        this.log("ERROR", message, data || {}, err);
    }

    // tslint:disable:no-console
    private log(level: string, message: string, data: ILoggerStructuredData, err?: any): void {
        level = level.padStart(5, " ");
        const structured = Object.keys(data).reduce((p, k) => `${p} | ${k}=${data[k]}`, "");
        const now = new Date().toISOString();
        console.log(`${now} | ${level} | ${message}${structured}`);
        if (err) {
            console.log(err);
        }
    }
}
