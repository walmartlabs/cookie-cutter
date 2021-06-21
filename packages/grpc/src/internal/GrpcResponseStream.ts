/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { AsyncPipe } from "@walmartlabs/cookie-cutter-core";
import { ServerWriteableStream } from "grpc";
import { IResponseStream } from "..";

export class GrpcResponseStream<T = any> implements IResponseStream<T> {
    public readonly pipe: AsyncPipe<T>;

    constructor(public readonly call: ServerWriteableStream<T>) {
        this.pipe = new AsyncPipe();
    }

    public get peer(): string {
        return this.call.getPeer();
    }

    public get cancelled(): boolean {
        return this.pipe.closed || this.call.cancelled;
    }

    public async close(): Promise<void> {
        if (!this.cancelled) {
            await this.pipe.close();
        }
    }

    public async send(response: T): Promise<void> {
        return await this.pipe.send(response);
    }
}
