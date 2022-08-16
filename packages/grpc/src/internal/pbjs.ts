/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as grpc from "@grpc/grpc-js";
import { IGrpcServiceDefinition, IGrpcServiceMethod } from "..";

/**
 * Creates a gRPC service definition that leverages the generated code
 * from PBJS to serialize/deserialize proto payloads.
 */
export function createServiceDefinition(spec: IGrpcServiceDefinition): grpc.ServiceDefinition<any> {
    const service = {};
    for (const key of Object.keys(spec)) {
        service[key] = createServiceMethodDefinition(spec[key]);
    }
    return service as grpc.ServiceDefinition<any>;
}

function createServiceMethodDefinition(method: IGrpcServiceMethod): any {
    return {
        path: method.path,
        requestType: method.requestType,
        requestStream: method.requestStream,
        responseType: method.responseType,
        responseStream: method.responseStream,
        requestSerialize: (request: any): Buffer => {
            const invalid = method.requestType.verify(request);
            if (invalid) {
                throw new Error(`Invalid request: ${invalid}`);
            }
            return Buffer.from(method.requestType.encode(request).finish());
        },
        requestDeserialize: (buffer: Buffer): any => {
            const request = method.requestType.decode(buffer);
            const invalid = method.requestType.verify(request);
            if (invalid) {
                throw new Error(`Invalid request: ${invalid}`);
            }
            return request;
        },
        responseSerialize: (response: any): Buffer => {
            const invalid = method.responseType.verify(response);
            if (invalid) {
                throw new Error(`Invalid response: ${invalid}`);
            }
            return Buffer.from(method.responseType.encode(response).finish());
        },
        responseDeserialize: (buffer: Buffer): any => {
            const response = method.responseType.decode(buffer);
            const invalid = method.responseType.verify(response);
            if (invalid) {
                throw new Error(`Invalid response: ${invalid}`);
            }
            return response;
        },
    };
}
