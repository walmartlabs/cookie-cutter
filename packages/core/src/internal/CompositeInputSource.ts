/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { DefaultComponentContext } from "../defaults";
import {
    EventProcessingMetadata,
    IComponentContext,
    IDisposable,
    IInputSource,
    IInputSourceContext,
    ILogger,
    IMessage,
    IMessageDeduper,
    IMessageEnricher,
    IMessageMetricAnnotator,
    IMetricTags,
    IRequireInitialization,
    Lifecycle,
    MessageRef,
} from "../model";
import { sleep, waitForPendingIO } from "../utils";
import { roundRobinIterators } from "./helpers";

export class CompositeInputSource
    implements IInputSource, IRequireInitialization, IDisposable, IMessageMetricAnnotator
{
    private logger: ILogger;

    constructor(
        private readonly inputs: Lifecycle<IInputSource>[],
        private readonly enrichers: IMessageEnricher[],
        private readonly annotators: IMessageMetricAnnotator[],
        private readonly deduper: Lifecycle<IMessageDeduper>
    ) {
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.logger = context.logger;
        await Promise.all(this.inputs.map((i) => i.initialize(context)));
        await this.deduper.initialize(context);
    }

    public async stop(): Promise<void> {
        await Promise.all(this.inputs.map((i) => i.stop()));
    }

    public async *start(context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        const sources = this.inputs.map((i) => i.start(context));
        if (sources.length === 0) {
            return;
        }

        let source = sources[0];
        if (sources.length > 1) {
            source = roundRobinIterators(sources, this.logger);
        }

        let sequence = 0;
        const pending = new Set<MessageRef>();
        for await (const msg of source) {
            msg.addMetadata({ [EventProcessingMetadata.Sequence]: sequence++ });

            for (const e of this.enrichers) {
                e.enrich(msg.payload);
            }

            try {
                const { dupe, message } = await this.deduper.isDupe(msg);
                if (dupe) {
                    this.logger.warn(`duplicate message detected, skipping ('${message}')`, {
                        type: msg.payload.type,
                    });

                    try {
                        await msg.release();
                    } catch (e) {
                        this.logger.error("failed to release input", e, { type: msg.payload.type });
                    }
                    continue;
                }

                pending.add(msg);
                msg.once("released", async (m) => {
                    pending.delete(m);
                });

                yield msg;
            } catch (e) {
                try {
                    await msg.release();
                } catch (e) {
                    this.logger.error("failed to release input", e, { type: msg.payload.type });
                }
                throw e;
            }
        }

        // only terminate this generator after all
        // elements yielded have been released
        while (pending.size > 0) {
            await sleep(100);
            await waitForPendingIO();
        }
    }

    public async dispose(): Promise<void> {
        await Promise.all(this.inputs.map((i) => i.dispose()));
        await this.deduper.dispose();
    }

    public annotate(msg: IMessage): IMetricTags {
        const tags = {};
        for (const r of this.annotators) {
            const t = r.annotate(msg);
            for (const key of Object.keys(t)) {
                tags[key] = t[key];
            }
        }
        return tags;
    }
}
