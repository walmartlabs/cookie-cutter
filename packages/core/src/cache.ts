/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { CachingStateProvider } from "./defaults";
import { IClassType, IState, IStateCacheLifecycle, IStateProvider } from "./model";

export interface ICacheOptions {
    readonly maxSize?: number;
    readonly maxTTL?: number;
}

export function cached<TState extends IState<TSnapshot>, TSnapshot>(
    TState: IClassType<TState>,
    underlying: IStateProvider<TState>,
    options?: ICacheOptions
): IStateProvider<TState> & IStateCacheLifecycle<TState> {
    return new CachingStateProvider(TState, underlying, options || {});
}
