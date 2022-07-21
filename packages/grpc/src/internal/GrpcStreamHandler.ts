/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    IComponentContext,
    IDisposable,
    ILogger,
    IRequireInitialization,
    waitForPendingIO,
} from "@walmartlabs/cookie-cutter-core";
import { GrpcResponseStream } from ".";

interface IGrpcStream {
    stream: GrpcResponseStream;
    complete: Promise<void>;
}

export class GrpcStreamHandler implements IRequireInitialization, IDisposable {
    private readonly pending = new Set<IGrpcStream>();
    private disposed: boolean = false;
    private logger: ILogger;

    constructor() {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
    }

    public addStream(stream: GrpcResponseStream): void {
        const complete = this.processStream(stream);
        const item = { stream, complete };
        this.pending.add(item);
        // tslint:disable-next-line:no-floating-promises
        complete.then(() => {
            this.pending.delete(item);
        });
    }

    private async processStream(stream: GrpcResponseStream): Promise<void> {
        let peer: string | undefined;
        try {
            peer = stream.peer;
            stream.call.on("error", async (err: Error) => {
                this.logger.error("gRPC response stream error", err, { peer });
                await stream.close();
            });

            if (this.disposed) {
                await stream.close();
            }

            for await (const item of stream.pipe) {
                await new Promise<void>(async (resolve, reject) => {
                    let written = false;
                    while (!written && !stream.call.cancelled) {
                        written = stream.call.write(item, () => {
                            resolve();
                        });
                        if (!written) {
                            this.logger.debug("failed to write to gRPC response stream, retrying", {
                                peer,
                            });
                            await waitForPendingIO();
                        }
                    }

                    if (stream.call.cancelled) {
                        reject(`gRPC response stream closed (${peer})`);
                    }
                });
            }
        } catch (e) {
            this.logger.error("gRPC stream processing error", e, { peer });
        } finally {
            stream.call.end();
        }
    }

    public async dispose(): Promise<void> {
        this.disposed = true;
        for (const item of this.pending) {
            await item.stream.close();
        }
    }
}
