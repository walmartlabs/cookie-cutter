/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { pascalCase } from "change-case";
import { IGrpcConfiguration } from "..";

export enum TracingOperations {
    ProcessingGrpcRequest = "Processing Grpc Request",
    MakingGrpcRequest = "Making Grpc Request",
}

export enum GrpcOpenTracingTagKeys {
    // Non-standard Tags
    ProtoType = "grpc.proto_type",
}

export function createGrpcConfiguration(config: IGrpcConfiguration): any {
    const settings: any = {};
    if (config.maximumPayloadSize !== undefined) {
        settings["grpc.max_send_message_length"] = config.maximumPayloadSize;
        settings["grpc.max_receive_message_length"] = config.maximumPayloadSize;
    }

    for (const key of Object.keys(config)) {
        if (key.startsWith("grpc.")) {
            settings[key] = config[key];
        }
    }

    return settings;
}

/**
 * convertOperationPath takes in paths passed in from a grpc service definition
 * and normalizes it to a standard version used across different input sources (e.g. Kafka).
 * It ensures that the method name is PascalCase to ensure compatibility with our naming convention
 * for proto based messages.
 * Example: /sample.SampleService/streaming -> grpc.sample.SampleService.Streaming
 *
 * @export
 * @param {string} path
 * @returns {string}
 */
export function convertOperationPath(path: string): string {
    const grpcPath = path.split("/");
    grpcPath[grpcPath.length - 1] = pascalCase(grpcPath[grpcPath.length - 1]);
    return `grpc${grpcPath.slice(1).join(".")}`;
}
