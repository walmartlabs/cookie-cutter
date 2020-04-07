/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IStateCacheLifecycle, IStateProvider, StateRef } from "../model";

/* istanbul ignore next */
export class NullStateProvider implements IStateProvider<any>, IStateCacheLifecycle<any> {
    public on() {
        // do nothing
    }
    public compute(stateRef: StateRef<any>) {
        return stateRef;
    }
    public get(): Promise<StateRef<any>> {
        return Promise.reject();
    }
    public invalidate(): void {
        // do nothing
    }
    public set(): void {
        // do nothing
    }
}
