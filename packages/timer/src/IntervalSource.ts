/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    AsyncPipe,
    DefaultComponentContext,
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    IInputSource,
    IMessage,
    IMetadata,
    IRequireInitialization,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import { Tags, Tracer } from "opentracing";
import { IIntervalConfig } from ".";
import { Interval } from "./Interval";

export const INTERVAL_EVENT_TYPE = "internal.Interval";

export class IntervalSource implements IInputSource, IRequireInitialization {
    private readonly pipe: AsyncPipe<MessageRef>;
    private timer: NodeJS.Timer | undefined;
    private tracer: Tracer;

    constructor(private readonly config: IIntervalConfig) {
        this.pipe = new AsyncPipe();
        this.timer = undefined;
        this.tracer = DefaultComponentContext.tracer;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
    }

    public start(): AsyncIterableIterator<MessageRef> {
        const timeout = this.config.firstTimeout || this.config.timeout;
        this.timer = setTimeout(this.onTimer.bind(this), timeout);
        return this.pipe;
    }

    public async stop(): Promise<void> {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        await this.pipe.close();
    }

    private async onTimer(): Promise<void> {
        if (this.timer === undefined) {
            return;
        }

        const interval = new Interval(new Date());
        const msg: IMessage = {
            type: INTERVAL_EVENT_TYPE,
            payload: interval,
        };

        const metadata: IMetadata = { [EventSourcedMetadata.EventType]: msg.type };

        const span = this.tracer.startSpan("Consuming Message From IntervalSource");
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_SERVER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-timer");

        const ref = new MessageRef(metadata, msg, span.context());
        ref.once("released", async (_, __, error) => {
            if (error) {
                failSpan(span, error);
            }
            span.finish();
            if (this.timer !== undefined) {
                const timeout = interval.nextTimeout || this.config.timeout;
                this.timer = setTimeout(this.onTimer.bind(this), timeout);
            }
        });

        try {
            await this.pipe.send(ref);
        } catch (e) {
            // nothing to do
        }
    }
}
