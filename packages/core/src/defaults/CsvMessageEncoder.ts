/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IMessageEncoder } from "../model";

export class CsvMessageEncoder implements IMessageEncoder {
    public readonly mimeType: string = "text/csv";

    public constructor(
        private headers: string[],
        private delimiter: string,
        private typeName?: string
    ) {}

    public encode(msg: IMessage): Uint8Array {
        const s: string[] = [];
        for (const header of this.headers) {
            s.push(msg.payload[header]);
        }
        return Buffer.from(s.join(this.delimiter));
    }

    public decode(data: Uint8Array, typeName?: string): IMessage {
        const decodedString = Buffer.from(data).toString();
        const values: string[] = decodedString.split(this.delimiter);
        if (this.headers.length < values.length) {
            throw new Error("Not enough header values for the returned csv row");
        }

        const csv = {};
        for (const [index, val] of values.entries()) {
            const headerKey = this.headers[index];
            if (headerKey === "") {
                continue;
            }
            csv[headerKey] = val;
        }

        return {
            type: typeName || this.typeName,
            payload: csv,
        };
    }
}
