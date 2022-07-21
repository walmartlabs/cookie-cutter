/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import { IAggregableState, IMessage, IStateAggregationSource } from "../model";

export class InMemoryStateAggregationSource<TSnapshot>
    implements IStateAggregationSource<TSnapshot>
{
    constructor(private readonly storage: Map<string, IMessage[]>) {}

    public async load(
        _: SpanContext,
        key: string,
        atSn?: number
    ): Promise<IAggregableState<TSnapshot>> {
        const stream = this.storage.get(key);
        if (!stream) {
            return {
                events: [],
                lastSn: 0,
            };
        }

        const slice = atSn === undefined ? new Array(...stream) : stream.slice(0, atSn - 1);

        return {
            events: slice,
            lastSn: slice.length,
        };
    }
}
