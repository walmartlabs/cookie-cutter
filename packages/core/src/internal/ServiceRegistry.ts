/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IComponentContext,
    IDisposable,
    IRequireInitialization,
    IServiceRegistry,
    Lifecycle,
} from "../model";

export class ServiceRegistry implements IServiceRegistry, IRequireInitialization, IDisposable {
    private services = new Map<string, Lifecycle<any>>();

    public async initialize(context: IComponentContext): Promise<void> {
        for (const service of this.services.values()) {
            await service.initialize(context);
        }
    }

    public register<T>(serviceName: string, service: Lifecycle<T>): void {
        this.services.set(serviceName, service);
    }

    public get<T>(serviceName: string): T {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Unregistered service ${service}`);
        }
        return service;
    }

    public async dispose(): Promise<void> {
        for (const service of this.services.values()) {
            await service.dispose();
        }
    }
}
