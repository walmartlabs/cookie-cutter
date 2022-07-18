/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    IApplicationBuilder,
    IComponentBuilder,
    IServiceRegistry,
    IServiceRegistryBuilder,
    Lifecycle,
    makeLifecycle,
} from "../model";
import { ServiceRegistry } from "./ServiceRegistry";

export class ServiceRegistryBuilder
    implements IServiceRegistryBuilder, IComponentBuilder<Lifecycle<IServiceRegistry>>
{
    private readonly serviceRegistry: ServiceRegistry;

    constructor(private readonly parent: IApplicationBuilder) {
        this.serviceRegistry = new ServiceRegistry();
    }

    public done(): IApplicationBuilder {
        return this.parent;
    }

    public build(): Lifecycle<IServiceRegistry> {
        return this.serviceRegistry;
    }

    public add<T>(serviceName: string, service: T): IServiceRegistryBuilder {
        this.serviceRegistry.register<T>(serviceName, makeLifecycle(service));
        return this;
    }
}
