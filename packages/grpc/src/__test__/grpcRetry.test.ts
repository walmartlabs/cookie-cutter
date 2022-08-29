/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

let mockMakeServerStreamRequest;
let mockMakeUnaryRequest;
jest.mock("@grpc/grpc-js", () => {
    const grpc = jest.requireActual("@grpc/grpc-js");
    return {
        ...grpc,
        makeGenericClientConstructor: () => {
            return function () {
                return {
                    ...grpc.makeGenericClientConstructor,
                    waitForReady: (_: any, callback: any): void => {
                        callback();
                    },
                    makeUnaryRequest: mockMakeUnaryRequest,
                    makeServerStreamRequest: mockMakeServerStreamRequest,
                };
            };
        },
    };
});

import {
    Application,
    CancelablePromise,
    ErrorHandlingMode,
    IDispatchContext,
    IDisposable,
    IRequireInitialization,
    RetryMode,
} from "@walmartlabs/cookie-cutter-core";
import { status } from "@grpc/grpc-js";
import { grpcClient, GrpcMetadata, grpcSource, IResponseStream } from "..";

import * as proto from "./Sample";

export import ISampleRequest = proto.sample.ISampleRequest;
export import ISampleResponse = proto.sample.ISampleResponse;
export import SampleRequest = proto.sample.SampleRequest;
export import SampleResponse = proto.sample.SampleResponse;
export import SampleService = proto.sample.SampleService;

export const SampleServiceDefinition = {
    NoStreaming: {
        path: "/sample.SampleService/NoStreaming",
        requestType: SampleRequest,
        requestStream: false,
        responseType: SampleResponse,
        responseStream: false,
    },
    StreamingIn: {
        path: "/sample.SampleService/StreamingIn",
        requestType: SampleRequest,
        requestStream: true,
        responseType: SampleResponse,
        responseStream: false,
    },
    StreamingOut: {
        path: "/sample.SampleService/StreamingOut",
        requestType: SampleRequest,
        requestStream: false,
        responseType: SampleResponse,
        responseStream: true,
    },
    Streaming: {
        path: "/sample.SampleService/Streaming",
        requestType: SampleRequest,
        requestStream: true,
        responseType: SampleResponse,
        responseStream: true,
    },
};

export interface ISampleService {
    NoStreaming(req: ISampleRequest): Promise<ISampleResponse>;
    StreamingIn(req: AsyncIterableIterator<ISampleRequest>): Promise<ISampleResponse>;
    StreamingOut(req: ISampleRequest): AsyncIterableIterator<ISampleResponse>;
    Streaming(req: AsyncIterableIterator<ISampleRequest>): AsyncIterableIterator<ISampleResponse>;
}

function testApp(handler: any, host: string, port: number): CancelablePromise<void> {
    return Application.create()
        .input()
        .add(
            grpcSource({
                port,
                host,
                definitions: [SampleServiceDefinition],
                skipNoStreamingValidation: true,
            })
        )
        .done()
        .dispatch(handler)
        .run(ErrorHandlingMode.LogAndContinue);
}

const handler = {
    onNoStreaming: async (
        request: ISampleRequest,
        _: IDispatchContext
    ): Promise<ISampleResponse> => {
        return { name: request.id.toString() };
    },
    onStreamingOut: async (request: ISampleRequest, ctx: IDispatchContext): Promise<void> => {
        const stream: IResponseStream<ISampleResponse> = ctx.metadata(GrpcMetadata.ResponseStream);
        await stream.send({ name: (request.id + 1).toString() });
        await stream.send({ name: (request.id + 2).toString() });
        await stream.close();
    },
};

const retryError: any = new Error("Retry this error");
retryError.code = status.UNAVAILABLE;
const throwError: any = new Error("Do not Retry");
throwError.code = status.UNKNOWN;

const behavior = {
    exponentBase: 2,
    maxRetryIntervalMs: 1000,
    mode: ErrorHandlingMode.LogAndRetryOrFail,
    randomize: false,
    retries: 5,
    retryIntervalMs: 1,
    retryMode: RetryMode.Linear,
};
const host = "localhost";
const port = 50001;

describe("grpc retry", () => {
    describe("non retriable error", () => {
        beforeEach(() => {
            mockMakeServerStreamRequest = () => {
                throw throwError;
            };
            mockMakeUnaryRequest = function () {
                arguments[6](throwError, undefined);
            };
        });

        it("fails on NoStreaming call", async () => {
            const app = testApp(handler, host, port);
            const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
                endpoint: `${host}:${port}`,
                definition: SampleServiceDefinition,
                behavior,
            });
            try {
                client.NoStreaming({ id: 10 }).catch((err) => {
                    expect(err).toMatchObject(throwError);
                });
            } finally {
                app.cancel();
                await app;
            }
        });

        it("fails on StreamingOut call", async () => {
            const app = testApp(handler, host, port);
            const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
                endpoint: `${host}:${port}`,
                definition: SampleServiceDefinition,
                behavior,
            });
            try {
                const response = client.StreamingOut({ id: 100 });
                await expect(response.next()).rejects.toMatchObject(throwError);
            } finally {
                app.cancel();
                await app;
            }
        });
    });

    describe("retriable error exceeds max retries", () => {
        beforeEach(() => {
            mockMakeServerStreamRequest = () => {
                throw retryError;
            };
            mockMakeUnaryRequest = function () {
                arguments[6](retryError, undefined);
            };
        });

        it("fails on NoStreaming call", async () => {
            const app = testApp(handler, host, port);
            const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
                endpoint: `${host}:${port}`,
                definition: SampleServiceDefinition,
                behavior,
            });
            try {
                client.NoStreaming({ id: 10 }).catch((err) => {
                    expect(err).toMatchObject(retryError);
                });
            } finally {
                app.cancel();
                await app;
            }
        });

        it("fails on StreamingOut call", async () => {
            const app = testApp(handler, host, port);
            const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
                endpoint: `${host}:${port}`,
                definition: SampleServiceDefinition,
                behavior,
            });
            try {
                const response = client.StreamingOut({ id: 100 });
                await expect(response.next()).rejects.toMatchObject(retryError);
            } finally {
                app.cancel();
                await app;
            }
        });
    });

    describe("retriable error succeeds", () => {
        const response = { name: "100" };
        let counter = 0;
        beforeEach(() => {
            counter = 0;
            mockMakeUnaryRequest = function () {
                counter++;
                if (counter === 1 || counter === 2) {
                    arguments[6](retryError, undefined);
                } else {
                    arguments[6](undefined, response);
                }
            };
        });

        it("succeeds on NoStreaming call", async () => {
            const app = testApp(handler, host, port);
            const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
                endpoint: `${host}:${port}`,
                definition: SampleServiceDefinition,
                behavior,
            });
            try {
                const response = await client.NoStreaming({ id: 10 });
                expect(response).toMatchObject(response);
            } finally {
                app.cancel();
                await app;
            }
        });
    });
});
