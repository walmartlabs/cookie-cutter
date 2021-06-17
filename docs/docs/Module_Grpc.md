---
id: module-grpc
title: gRPC
---

Though Cookie Cutter is a framework for message streaming APIs, it has support for writing gRPC services and invoking other gRPC services from sinks or message handlers. Currently the only limitation is that client-side streams are not supported when implementing gRPC servers, however server-side streams are. The gRPC solution is intertwined with the Proto module and currently only supports protobuf encoders generated with `protobufjs`.

## Defining Service Definitions

For the gRPC service to accept requests for our operations and use the encoders generated with `protobufjs` we need to create a service definition.

```protobuf
package sample;

message SampleRequest {
    int32 id = 1;
}

message SampleResponse {
    string name = 1;
}

service SampleService {
    rpc SampleOperation(SampleRequest) (SampleResponse);
    rpc SampleStream(SampleRequest) stream(SampleRequest);
}
```

Service definitions follow a simple pattern, for each operation they define the type of the encoder class for request and response. In addition you may want to define an interface for gRPC clients.

```typescript
interface ISampleService {
    SampleOperation(req: SampleRequest, context: SpanContext): Promise<SampleResponse>;
    SampleStream(req: SampleRequest, context: SpanContext): AsyncIterableIterator<SampleResponse>;
}
```

```typescript
import proto from "bundle"; // these are the pbjs generates types

const SampleServiceDefinition = {
    SampleOperation: {
        path: "/sample.SampleService/SampleOperation",
        requestType: proto.SampleRequest,
        requestStream: false,
        responseType: proto.SampleResponse,
        responseStream: false,
    },
    SampleStream: {
        path: "/sample.SampleService/SampleStream",
        requestType: proto.SampleRequest,
        requestStream: false,
        responseType: proto.SampleResponse,
        responseStream: true,
    },
}
```

## gRPC Server

### RPC

A simple gRPC server for above's service definition looks like below. Cookie Cutter will treat every incoming gRPC request as a message that flows through the framework's pipeline. The main difference is that the message handler's function must be named after the gRPC operation and not after the request's message type. Also the message handler will have a return value now that represents the gRPC response. A message handler may in addition publish or store additional messages. The gRPC request will be completed by sending the response after all publish and store outputs have been processed - this includes any potential retries due to optimistic concurrency issues.

```typescript
Application.create()
    .input()
        .add(grpcSource({
            host: "localhost",
            port: 5000,
            definitions: [ SampleServiceDefinition ]
        }))
        .done()
    .dispatch({
        onSampleOperation: (req: ISampleRequest, ctx: IDispatchContext): ISampleResponse => {
            return { name: req.id.toString() };
        },
    });
    .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Rpc);
```

### Server-Side Streams

The example below accepts gRPC client requests and replies with a stream of 10 messages (once per second) and then ends the stream call.

```typescript
Application.create()
    .input()
        .add(grpcSource({
            host: "localhost",
            port: 5000,
            definitions: [ SampleServiceDefinition ]
        }))
        .add(intervalSource({
            timeout: 1000,
        }))
        .done()
    .dispatch({
        consumers: [ ],
        onSampleStream: (req: ISampleRequest, ctx: IDispatchContext): void => {
            const stream = ctx.metadata<IResponseStream<ISampleResponse>>(GrpcMetadata.ResponseStream);
            this.consumers.push({ stream, count: 0 });
        },
        onInterval: (msg: IInterval, ctx: IDispatchContext): Promise<void> => {
            for (const item of this.consumers) {
                const { stream } = item;
                if (item.count === 10) {
                    stream.close();
                } else {
                    ctx.logger.info(`sending msg to ${item.peer}`);
                    await item.send({ name: "hello " + item.count });
                }
                item.count++;
            }
        }
    });
    .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Rpc);
```

### Metadata

The following metadata is available for gRPC requests

| Name | Description |
|------|-------------|
| GrpcMetadata.Peer | the host and port of the client sending the request |
| GrpcMetadata.OperationPath | the full name of the operation invoked by the client |
| GrpcMetadata.ResponseStream | handle to a `IResponseStream<TResponse>` object that can be used for server-side streams |

### Error Handling

Any errors thrown by a message handler will be relayed to the gRPC client. This only works in `LogAndContinue` mode though, if the service has to run in `LogAndRetry` mode then it is possible to return an error from a message handler instead of throwing it, which will then propagate to the gRPC client the same way.

```typescript
Application.create()
    .input()
        .add(grpcSource(...))
        .done()
    .dispatch({
        onSampleOperation: (req: ISampleRequest, ctx: IDispatchContext): ISampleResponse => {
            // the preferred way to error out a call
            throw new Error("bad input");
        },
    });
    .run(ErrorHandlingMode.LogAndContinue, ParallelismMode.Rpc);

Application.create()
    .input()
        .add(grpcSource(...))
        .done()
    .dispatch({
        onSampleOperation: (req: ISampleRequest, ctx: IDispatchContext): ISampleResponse | Error => {
            // use this pattern if service is LogAndRetry
            return new Error("bad input");
        },
    });
    .run(ErrorHandlingMode.LogAndRetry, ParallelismMode.Rpc);
```

### Runtime Options

It is recommended to run gRPC servers in `LogAndContinue` + `RPC` mode as incoming requests usually don't require any kinds of ordering guarantees are can be executed independent of each other.

## gRPC Client

gRPC clients can be created with the `grpcClient` helper function and should be registered as services with Cookie Cutter as they require initialization and disposal.

```typescript
Application.create()
    .services()
        .add("some-service", grpcClient<ISampleService>({
            endpoint: "localhost:5000",
            definition: SampleServiceDefinition,
        }))
        .done()
    .dispatch({
        onSomeInput: (msg: ISomeInput, ctx: IDispatchContext): Promise<void> => {
            const client = ctx.services.get<ISampleService>("some-service");

            // invoke regular RPC call
            const response = await client.SampleOperation({ id: 1 }, ctx.trace.context);

            // consume stream
            const stream = client.SampleStream({ id: 1 1}, ctx.trace.context);
            for async (const item of stream) {
                // do something
            }
        }
    })
```
