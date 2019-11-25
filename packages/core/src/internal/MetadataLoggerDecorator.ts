/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { isDate, isNumber, isString } from "util";
import { ILogger, ILoggerStructuredData, IMetadata } from "../model";

export class MetadataLoggerDecorator implements ILogger {
    private fromMetadata: ILoggerStructuredData;
    constructor(private readonly logger: ILogger, meta: IMetadata) {
        this.fromMetadata = {};
        if (meta !== undefined) {
            for (const key of Object.keys(meta)) {
                const val = meta[key];
                if (!key.includes("sys.", 0) && (isString(val) || isNumber(val) || isDate(val))) {
                    this.fromMetadata[key] = val;
                }
            }
        }
    }

    public info(message: string, data?: ILoggerStructuredData): void {
        this.logger.info(message, { ...this.fromMetadata, ...data });
    }

    public debug(message: string, data?: ILoggerStructuredData): void {
        this.logger.debug(message, { ...this.fromMetadata, ...data });
    }

    public warn(message: string, data?: ILoggerStructuredData): void {
        this.logger.warn(message, { ...this.fromMetadata, ...data });
    }

    public error(message: string, err?: any, data?: ILoggerStructuredData): void {
        this.logger.error(message, err, { ...this.fromMetadata, ...data });
    }
}
