---
id: comp-dispatch-context
title: Dispatch Context
---

A dispatch context provides context for an incoming message being handled by a message handler. It allows the message handler to access metadata information about the input message, define the output messages, gain access to state, etc ...

## IDispatchContext<TState = any>

```typescript
export interface IDispatchContext<TState = any> {
    metadata<T>(key: string): T;
    publish<T>(type: IClassType<T>, msg: T, meta?: Readonly<{ [key in string]: any }>): void;
    store<T>(type: IClassType<T>, state: StateRef<TState>, msg: T): void;
    typeName<T>(type: IClassType<T>): string;
    bail(err: any): never; // deprecated
    readonly services: IServiceRegistry;
    readonly state: IDispatchState<TState>;
    readonly metrics: IMetrics;
    readonly logger: ILogger;
    readonly trace: ITracing;
    readonly retry: RetrierContext;
}
```

## TState

The optional type parameter `TState` allows you to specify the type that should be returned from `ctx.state.get`. The only purpose of this is to get compile-time type checks and auto-completion in the IDE. For message handler functions not dealing with state the type parameter can be left out as it defaults to `any`.

## metadata

The `metadata` function allows the message handler to access metadata associated with the input message. This could for example be the name of the input topic for messages originating from Kafka, or the remote endpoint address for incoming gRPC requests. The type parameter `T` works similar to `TState` - it only helps with compile-time type checks, but it will not cause the value to be converted to `T`.

```typescript
function onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
    // will print the topic name the input message originated from
    ctx.logger.info(ctx.metadata<string>(KafkaMetadata.Topic));
}
```

## typeName

Type `typeName` function allows a message handler to invoke the `Type Mapper` that was configured for the application (see [Outputs](Introduction_Outputs.md#type-mappers)) and retrieve the type name for a given class / constructor function.

## logger

Allows the message handler to access the logger that was configured for the application. Example

```typescript
function onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
    ctx.logger.info("something is happening", {
        more_info: "xyz-1",
    });
}
```

## trace

This field allows the message handler to access the currently active `Span` that is used for processing the message. The message handler may use this to create additional child spans or add tags to the `Span` the framework created.

```typescript
async function onMyInput(msg: IMyInput, ctx: IDispatchContext): Promise<void> {
    // add a tag to the existing span
    ctx.trace.addTags({
        customerId: msg.customerId,
    });

    // pass the current span context to another function
    await doProcessing(ctx.trace.context, msg);

    // create a child for RPC call
    const span = ctx.trace.child("http operation");
    try {
        await fetch("http://www.google.com");
    } finally {
        span.finish();
    }
}
```

## metrics

Allows the message handler to emit metrics to the configured metrics provider.

```typescript
function onOrderPlaced(msg: IOrderPlaced, ctx: IDispatchContext): void {
    ctx.metrics.increment("money spent", {
        amount: msg.amount,
    });
}
```

## state

The `state` property allows the message handler to retrieve state from the configured state provider via the `get` function. It requires the key identifying the state and optionally accepts `atSn` as its second argument to retrieve the state at a certain point in time. `get` will always return a `StateRef` with an instance of the state object inside. If the state does not exist in the underlying persistence system then it will return the default state. The default state is defined as invoking the constructor function of the state class without a snapshot.

In addition `state` also exposes a method named `compute` which will compute the state that includes all messages the message handler has `store`_d_ so far. `compute` can be invoked without parameters and then it will return all states that have been modified or it can be called for a particular `key`. It will return `undefined` if no messages have been `store`_d_ for the state yet.


```typescript
async function onMyInput(msg: IMyInput, ctx: IDispatchContext<MyState>): Promise<void> {
    // load state by key
    const stateRef = await ctx.state.get("some-key");

    // emit message to change state
    ctx.store(OutputEvent, stateRef, { /* payload */ });

    // compute the state that we would have if the stored
    // message was going to be persisted
    const updatedStatRef = ctx.state.compute("some-key");
}
```

## publish / store

The publish and store functions expresses the intent to route a message to the corresponding output sink that is configured for published or stored messages. Calling the function doesn't immediately cause the message to be routed, though. It will add the message to a buffer and only after the message handler function returns will it pass the entire buffer to the output sink. Should the message handler throw an error none of the messages in the buffer will be routed to the sink. This behavior guarantees atomicity of a single handler function - either the entire output will be routed or none of it. In addition this also allows the framework to efficiently batch messages on the output side and therefore increase throughput.

### publish

Publish accepts three arguments

1. the type of the output message in the form of a JavaScript class type / constructor function
2. the payload of the message (this can either be an instance of the class type or an anonymous object that matches the signature)
3. optional metadata for the output sink. The metadata keys/values are specific to the particular sinks, please see documentation of the sink for more details.

### store

Store accepts three arguments

1. the type of the output message in the form of a JavaScript class type / constructor function.
2. the `stateRef` that this state update is based upon. it serves as the optimistic concurrency token.
3. the payload of the message (this can either be an instance of the class type or an anonymous object that matches the signature)

## RetrierContext

The RetrierContext allows anyone with access to the dispatch context to communicate with the retrier. It can be used to inform the retrier that it should stop retrying by calling `ctx.retry.bail(err: any)`. The RetrierContext can also be used to override the next retry interval by using `ctx.retry.setNextRetryInterval(intervalInMs: number)`.

```typescript
interface IRetrierContext {
    // ...
    bail: (err: any) => never;
    setNextRetryInterval: (interval: number) => void;
}
```

```typescript
async function onMyInput(msg: IMyInput, ctx: IDispatchContext<MyState>): Promise<void> {
    try {
        // action that can throw
    } catch (e) {
        if (isRetryableError(e)) {
            if (e.headers && e.headers[RETRY_AFTER_MS]) {
                ctx.retry.setNextRetryInterval(parseInt(e.headers[RETRY_AFTER_MS], 10));
            }
            throw e;
        } else {
            ctx.retry.bail(e);
        }
    }
}
```

## bail (deprecated)

Use `ctx.retry.bail(err: any)` instead of `ctx.bail(err: any)`.