/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { networkInterfaces } from "os";

import {
    Application,
    CancelablePromise,
    ErrorHandlingMode,
    IDispatchContext,
    IDisposable,
    IRequireInitialization,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { SpanContext } from "opentracing";
import {
    grpcClient,
    GrpcMetadata,
    grpcSource,
    IGrpcClientConfiguration,
    IGrpcConfiguration,
    IResponseStream,
} from "..";
import { sample } from "./Sample";

let nextPort = 56011;

export interface ISampleService {
    NoStreaming(
        request: sample.ISampleRequest,
        spanContext?: SpanContext
    ): Promise<sample.ISampleResponse>;
    StreamingIn(
        request: AsyncIterableIterator<sample.ISampleRequest> | ArrayLike<sample.ISampleRequest>,
        spanContext?: SpanContext
    ): Promise<sample.ISampleResponse>;
    StreamingOut(
        request: sample.ISampleRequest,
        spanContext?: SpanContext
    ): AsyncIterableIterator<sample.ISampleResponse>;
    Streaming(
        request: AsyncIterableIterator<sample.ISampleRequest> | ArrayLike<sample.ISampleRequest>,
        spanContext?: SpanContext
    ): AsyncIterableIterator<sample.ISampleResponse>;
}
export const SampleServiceDefinition = {
    NoStreaming: {
        path: "/sample.SampleService/NoStreaming",
        requestType: sample.SampleRequest,
        requestStream: false,
        responseType: sample.SampleResponse,
        responseStream: false,
    },
    StreamingIn: {
        path: "/sample.SampleService/StreamingIn",
        requestType: sample.SampleRequest,
        requestStream: true,
        responseType: sample.SampleResponse,
        responseStream: false,
    },
    StreamingOut: {
        path: "/sample.SampleService/StreamingOut",
        requestType: sample.SampleRequest,
        requestStream: false,
        responseType: sample.SampleResponse,
        responseStream: true,
    },
    Streaming: {
        path: "/sample.SampleService/Streaming",
        requestType: sample.SampleRequest,
        requestStream: true,
        responseType: sample.SampleResponse,
        responseStream: true,
    },
};

function testApp(handler: any, host?: string): CancelablePromise<void> {
    return Application.create()
        .input()
        .add(
            grpcSource({
                port: nextPort,
                host,
                definitions: [SampleServiceDefinition],
                skipNoStreamingValidation: true,
            })
        )
        .done()
        .dispatch(handler)
        .run(ErrorHandlingMode.LogAndContinue);
}

async function createClient(
    host?: string,
    config?: Partial<IGrpcClientConfiguration & IGrpcConfiguration>
): Promise<ISampleService & IRequireInitialization & IDisposable> {
    const client = grpcClient<ISampleService & IRequireInitialization & IDisposable>({
        endpoint: `${host || "localhost"}:${nextPort++}`,
        definition: SampleServiceDefinition,
        ...config,
    });
    return client;
}

describe("gRPC source", () => {
    it("serves requests", async () => {
        const app = testApp({
            onNoStreaming: async (
                request: sample.ISampleRequest,
                _: IDispatchContext
            ): Promise<sample.ISampleResponse> => {
                return { name: request.id.toString() };
            },
        });
        try {
            const client = await createClient();
            const response = await client.NoStreaming({ id: 15 });
            expect(response).toMatchObject({ name: "15" });
        } finally {
            app.cancel();
            await app;
        }
    });

    it("serves response streams", async () => {
        const app = testApp({
            onStreamingOut: async (
                request: sample.ISampleRequest,
                ctx: IDispatchContext
            ): Promise<void> => {
                const stream: IResponseStream<sample.ISampleResponse> = ctx.metadata(
                    GrpcMetadata.ResponseStream
                );
                await stream.send({ name: request.id.toString() });
                await stream.send({ name: request.id.toString() });
                await stream.close();
            },
        });

        try {
            const client = await createClient();
            const response = await client.StreamingOut({ id: 15 });
            const result = [];
            for await (const item of response) {
                result.push(item);
            }
            expect(result).toMatchObject([{ name: "15" }, { name: "15" }]);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("shuts down gracefully with dangling response streams", async () => {
        const app = testApp({
            onStreamingOut: async (
                request: sample.ISampleRequest,
                ctx: IDispatchContext
            ): Promise<void> => {
                const stream: IResponseStream<sample.ISampleResponse> = ctx.metadata(
                    GrpcMetadata.ResponseStream
                );
                await stream.send({ name: request.id.toString() });

                // -> don't call close
                // await stream.close();
            },
        });

        try {
            const client = await createClient();
            for (let i = 0; i < 1000; i++) {
                await client.StreamingOut({ id: 15 });
            }
        } finally {
            app.cancel();
            await app;
        }
    });

    it("supports errors being returned", async () => {
        const app = testApp({
            onNoStreaming: async (
                _: sample.ISampleRequest,
                __: IDispatchContext
            ): Promise<sample.ISampleResponse | Error> => {
                return new Error("bad request");
            },
        });

        try {
            const client = await createClient();
            const response = client.NoStreaming({ id: 15 });
            await expect(response).rejects.toThrowError(/bad request/);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("supports errors being thrown", async () => {
        const app = testApp({
            onNoStreaming: async (
                _: sample.ISampleRequest,
                __: IDispatchContext
            ): Promise<sample.ISampleResponse> => {
                throw new Error("bad request");
            },
        });

        try {
            const client = await createClient();
            const response = client.NoStreaming({ id: 15 });
            await expect(response).rejects.toThrowError(/bad request/);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("throws error for unhandled operations", async () => {
        const app = testApp({});

        try {
            const client = await createClient();
            const response = client.NoStreaming({ id: 15 });
            await expect(response).rejects.toThrowError(/not implemented/);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("validates that no streaming operations are exposed", () => {
        const a = () =>
            grpcSource({
                port: 5001,
                definitions: [SampleServiceDefinition],
            });

        expect(a).toThrow();
    });

    it("serves requests on configured host", async () => {
        const host = getNonInternalIp();
        const app = testApp(
            {
                onNoStreaming: async (
                    request: sample.ISampleRequest,
                    _: IDispatchContext
                ): Promise<sample.ISampleResponse> => {
                    return { name: request.id.toString() };
                },
            },
            host
        );
        try {
            const client = await createClient(host);
            const response = await client.NoStreaming({ id: 15 });
            expect(response).toMatchObject({ name: "15" });
        } finally {
            app.cancel();
            await app;
        }
    });

    it("honors request timeout configuration", async () => {
        const app = testApp({
            onNoStreaming: async (
                _: sample.ISampleRequest,
                __: IDispatchContext
            ): Promise<sample.ISampleResponse | Error> => {
                await sleep(100);
                return { name: "15" };
            },
        });

        try {
            const client = await createClient(undefined, { requestTimeout: 5 });
            const response = client.NoStreaming({ id: 15 });
            await expect(response).rejects.toThrowError(/Deadline exceeded/);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("honors connection timeout configuration", async () => {
        const app = testApp({
            onNoStreaming: async (
                _: sample.ISampleRequest,
                __: IDispatchContext
            ): Promise<sample.ISampleResponse | Error> => {
                return { name: "15" };
            },
        });

        try {
            const client = await createClient("not-a-valid-host", { connectionTimeout: 50 });
            const response = client.NoStreaming({ id: 15 });
            await expect(response).rejects.toThrowError(/Failed to connect/);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("makes peer's hostname available in message handler", async () => {
        const app = testApp(
            {
                onNoStreaming: async (
                    _: sample.ISampleRequest,
                    ctx: IDispatchContext
                ): Promise<sample.ISampleResponse | Error> => {
                    return { name: ctx.metadata<string>(GrpcMetadata.Peer) };
                },
            },
            getNonInternalIp()
        );

        try {
            const client = await createClient(getNonInternalIp());
            const response = client.NoStreaming({ id: 15 });
            await expect(response).resolves.toMatchObject({
                // should contain an IPv4 address + port
                name: expect.stringMatching(/(\d+\.){3}\d+\:\d+/),
            });
        } finally {
            app.cancel();
            await app;
        }
    });
});

function getNonInternalIp(): string {
    const interfaces = networkInterfaces();
    for (const ifname of Object.keys(interfaces)) {
        for (const iface of interfaces[ifname]) {
            if ("IPv4" !== iface.family || iface.internal !== false) {
                // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                continue;
            }
            return iface.address;
        }
    }
}
