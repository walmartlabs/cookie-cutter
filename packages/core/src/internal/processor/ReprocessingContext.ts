/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { EventProcessingMetadata, MessageRef } from "../../model";
import { BufferedDispatchContext } from "../BufferedDispatchContext";

export class ReprocessingContext {
    private readonly seenKeys: Set<string>;
    private readonly toEvict: string[];

    constructor(public readonly atSn: number) {
        this.seenKeys = new Set();
        this.toEvict = [];
    }

    private evict(key: string): void {
        if (!this.seenKeys.has(key)) {
            this.seenKeys.add(key);
            this.toEvict.push(key);
        }
    }

    public wrap(context: BufferedDispatchContext): MessageRef {
        for (const stateRef of context.loadedStates) {
            this.evict(stateRef.key);
        }

        context.source.addMetadata({ [EventProcessingMetadata.ReprocessingContext]: this });
        return context.source;
    }

    public *evictions(): IterableIterator<string> {
        while (this.toEvict.length > 0) {
            yield this.toEvict.shift();
        }
    }
}
