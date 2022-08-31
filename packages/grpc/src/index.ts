/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    config,
    ErrorHandlingMode,
    IComponentRuntimeBehavior,
    IDisposable,
    IInputSource,
    IMessage,
    IRequireInitialization,
    RetryMode,
} from "@walmartlabs/cookie-cutter-core";
import {
    convertOperationPath,
    createGrpcClient,
    GrpcClientConfiguration,
    GrpcInputSource,
    GrpcSourceConfiguration,
} from "./internal";

export interface IProtocolBufferType {
    new (): any;
    encode(message: any, writer?: any): { finish(): Uint8Array };
    decode(reader: Uint8Array, length?: number): any;
    verify(message: any): string | null;
}

export interface IGrpcServiceMethod {
    readonly path: string;
    readonly requestType: IProtocolBufferType;
    readonly responseType: IProtocolBufferType;
    readonly requestStream: boolean;
    readonly responseStream: boolean;
}

export interface IGrpcServiceMethods {
    readonly [key: string]: IGrpcServiceMethod;
}

export interface IGrpcServiceDefinition {
    readonly [key: string]: IGrpcServiceMethod;
}

export interface IGrpcConfiguration {
    readonly maximumPayloadSize?: number;
    readonly [grpcConfigKey: string]: any;
}

export interface IGrpcServerConfiguration {
    readonly port: number;
    readonly host?: string;
    readonly definitions: IGrpcServiceDefinition[];
    readonly skipNoStreamingValidation?: boolean;
}

export interface IGrpcClientConfiguration {
    readonly endpoint: string;
    readonly definition: IGrpcServiceDefinition;
    readonly connectionTimeout?: number;
    readonly requestTimeout?: number;
    readonly behavior?: Required<IComponentRuntimeBehavior>;
}

export enum GrpcMetadata {
    OperationPath = "grpc.OperationPath",
    ResponseStream = "grpc.ResponseStream",
    Peer = "grpc.Peer",
}

export interface IResponseStream<TResponse> {
    readonly peer: string;
    readonly cancelled: boolean;
    send(response: TResponse): Promise<void>;
    close(): Promise<void>;
}

export function grpcSource(
    configuration: IGrpcServerConfiguration & IGrpcConfiguration
): IInputSource & IRequireInitialization {
    configuration = config.parse<IGrpcServerConfiguration & IGrpcConfiguration>(
        GrpcSourceConfiguration,
        configuration,
        {
            host: "localhost",
            allocator: Buffer,
        }
    );
    return new GrpcInputSource(configuration);
}

export function grpcMsg(operation: IGrpcServiceMethod, request: any): IMessage {
    return {
        payload: request,
        type: convertOperationPath(operation.path),
    };
}

export function grpcClient<T>(
    configuration: IGrpcClientConfiguration & IGrpcConfiguration,
    certPath?: string
): T & IRequireInitialization & IDisposable {
    configuration = config.parse<IGrpcClientConfiguration & IGrpcConfiguration>(
        GrpcClientConfiguration,
        configuration,
        {
            connectionTimeout: 2000,
            requestTimeout: 10000,
            allocator: Buffer,
            behavior: {
                exponentBase: 2,
                maxRetryIntervalMs: 10000,
                mode: ErrorHandlingMode.LogAndRetryOrFail,
                randomize: false,
                retries: 10,
                retryIntervalMs: 100,
                retryMode: RetryMode.Exponential,
            },
        }
    );
    return createGrpcClient<T>(configuration, certPath);
}
