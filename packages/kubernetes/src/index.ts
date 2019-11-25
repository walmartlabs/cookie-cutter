/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config, IInputSource } from "@walmartlabs/cookie-cutter-core";
import { KubernetesAdmissionControllerSource } from "./KubernetesAdmissionControllerSource";
import { KubernetesWatchSource } from "./KubernetesWatchSource";

export interface IK8sAdmissionControllerSourceConfiguration {
    readonly privateKey: string;
    readonly cert: string;
    readonly requestPaths: string[];
    readonly port?: number;
}

export interface IK8sWatchConfiguration {
    readonly queryPath: string;
    readonly queryParams?: any;
    readonly configFilePath?: string;
    readonly currentContext?: string;
}

@config.section
class K8sAdmissionControllerSourceConfiguration
    implements IK8sAdmissionControllerSourceConfiguration {
    @config.field(config.converters.string)
    public set privateKey(_: string) {
        config.noop();
    }
    public get privateKey(): string {
        return config.noop();
    }
    @config.field(config.converters.string)
    public set cert(_: string) {
        config.noop();
    }
    public get cert(): string {
        return config.noop();
    }
    @config.field(config.converters.listOf(config.converters.string))
    public set requestPaths(_: string[]) {
        config.noop();
    }
    public get requestPaths(): string[] {
        return config.noop();
    }

    @config.field(config.converters.number)
    public set port(_: number) {
        config.noop();
    }
    public get port(): number {
        return config.noop();
    }
}

@config.section
class K8sWatchConfiguration implements IK8sWatchConfiguration {
    @config.field(config.converters.string)
    public set queryPath(_: string) {
        config.noop();
    }
    public get queryPath(): string {
        return config.noop();
    }

    @config.field(config.converters.none)
    public set queryParams(_: any) {
        config.noop();
    }
    public get queryParams(): any {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set configFilePath(_: string) {
        config.noop();
    }
    public get configFilePath(): string {
        return config.noop();
    }

    @config.field(config.converters.string)
    public set currentContext(_: string) {
        config.noop();
    }
    public get currentContext(): string {
        return config.noop();
    }
}

export interface IAdmissionReviewRequest {
    // request path of the https requests
    readonly path: string;
    // Name of the resource being modified
    readonly name: string;
    // Namespace of the resource being modified, if the resource is namespaced (or is a Namespace object)
    readonly namespace: string;
    // operation can be CREATE, UPDATE, DELETE, or CONNECT
    readonly operation: string;
    // object is the new object being admitted. It is null for DELETE operations.
    object: any;
    // oldObject is the existing object. It is null for CREATE and CONNECT operations (and for DELETE operations in API servers prior to v1.15.0)
    readonly oldObject: any;
    // dryRun indicates the API request is running in dry run mode and will not be persisted.
    readonly dryRun: boolean;
}

export interface IK8sAdmissionReviewResponse {
    allowed: boolean;
    status?: { code: number; message: string };
    modifiedObject?: any;
}

export class K8sAdmissionReviewRequest {
    constructor(public readonly request: IAdmissionReviewRequest) {}
}

export class K8sResourceAdded {
    constructor(public readonly resource: any) {}
}

export class K8sResourceModified {
    constructor(public readonly resource: any) {}
}

export class K8sResourceDeleted {
    constructor(public readonly resource: any) {}
}

export function k8sWatchSource(configuration: IK8sWatchConfiguration): IInputSource {
    configuration = config.parse(K8sWatchConfiguration, configuration, {
        queryParams: {},
    });
    return new KubernetesWatchSource(configuration);
}

export function k8sAdmissionControllerSource(
    configuration: IK8sAdmissionControllerSourceConfiguration
): IInputSource {
    configuration = config.parse(K8sAdmissionControllerSourceConfiguration, configuration, {
        port: 443,
    });
    return new KubernetesAdmissionControllerSource(configuration);
}
