---
id: intro-message-handling
title: Message Handling
---

## Conventions

Messages from the input source are dispatched to a message handler that is wired up with the `dispatch` method in the application's setup.

```typescript
Application.create()
    .dispatch({
        onMessageType(msg: IMessageType, ctx: IDispatchContext): void {

        }
    })
```

A handler can be any object that exposes functions following the pattern `on{MessageType}` where `MessageType` matches the `type` field of the `IMessage` emitted from the input source. Type names with namespaces are supported if the parts of the namespace are delimited with a '.', for instance `mycompany.division.MessageType` will match to a function called `onMessageType`.

The first argument of every handler function is the message itself. The handler will receive the `payload` field from `IMessage` which is usually the deserialized version of the data that was received over the wire. For example if the input source receives messages from Kafka that are JSON encoded then `msg` would be the deserialized JSON.

## Dispatch Context

The second argument of a handler function is the dispatch context. It gives the handler access to various framework components and metadata about the input message.

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

Notably the `IDispatchContext` is used to set the message handler's outputs via the `publish` and `store` methods. It also allows the message handler to get access to state. For more details please see [Dispatch Context](Comp_DispatchContext.md).

## Sync vs. Async

Message handlers can either be implemented sync (return type `void`) or async (return type `Promise<void>`). The async mode is mainly intended for services that deal with state since acquiring the current state is a potentially async operation. The framework will detect whether a handler function returns void or a Promise and await it accordingly.

## Before & After Handlers

In addition to handlers for individual message types you may also add a `before` and/or a `after` function that will get invoked before or after the actual message handler is called. However, before and after are only invoked if there is a message handler for the specific message type.

```typescript
export function before(msg: IMessage, ctx: IDispatchContext): void {
    // do something
}

export function after(msg: IMessage, ctx: IDispatchContext): void {
    // do something
}
```

Please mind that `before` and `after`'s first argument is of type `IMessage`. Both functions have access to the same dispatch context that the actual message handler receives and therefore they can emit additional outputs via `store` or `publish`.

## Invalid Message Handler

Another handler that can be added is the `invalid` function which will get invoked if a message does not pass input validation. This handler will be invoked for any message that does not pass validation. For invalid messages, this functions allows logging the payload of the message or any other relevant metadata. It can also be used to throw an Error and force the application to terminate if in `LogAndFail` or `LogAndRetryOrFail` mode (if that's appropriate for the use case).

 Defining this function disables the built-in log for `received invalid message`.

```typescript
export function invalid(msg: IMessage, ctx: IDispatchContext): void {
    // do something
}
```

As with the other handlers, this function also has access to the dispatch context and can emit additional outputs via `store` or `publish`. These outputs will be passed through output validation.

## Implementation Strategies

### Dispatch Target Class

The most straightforward way to implement a message handler is to create a class that exposes one function per message type like illustrated below.

```typescript
class MessageHandler {
    public onMessageA(msg: IMessageA, ctx: IDispatchContext): void {
        // do something ...
    }

    public async onMessageB(msg: IMessageB, ctx: IDispatchContext): Promise<void> {
        // await some operation
    }
}

Application.create()
    .dispatch(new MessageHandler())
```

This approach works well for small services that only handle a few message types.

### Dispatch Target Module

Another option is to use node's module system to our advantage and break up our message handlers into individual files per message type.

```typescript
// src/handler/MessageA.ts
export function onMessageA(msg: IMessageA, ctx: IDispatchContext): void {
    // do something ...
}

// src/handler/MessageB.ts
export async function onMessageB(msg: IMessageB, ctx: IDispatchContext): Promise<void> {
    // await some operation
}

// src/handler/index.ts
export * from "./MessageA.ts";
export * from "./MessageB.ts";

// src/index.ts
Application.create()
    .dispatch(require("./handler"))
```

This will allow you to structure your service better, however the one downside is that we lose the ability to use constructor injection for any dependencies the message handlers might have.

## Error Handling

Cookie Cutter will automatically catch all errors thrown by any message handler, write a log message and apply the error handling mode that was configured for the application. You should generally not try to catch errors in message handlers yourself unless you have a meaningful way of handling them.

## Custom Dispatch Strategies

If the convention based dispatch strategy is not a good fit for your use case then there is a way to overwrite the behavior of how messages are handled.

```typescript
export interface IMessageDispatcher {
    canDispatch(msg: IMessage): boolean;
    dispatch(msg: IMessage, ctx: IDispatchContext): Promise<any>;
}
```

You may supply a custom implementation of this interface instead of an object with handler functions.

```typescript
Application.create()
    // ...
    .dispatch(new MyDispatcher())
    .run();
```

The framework will first call `canDispatch` for every single message emitted by an input source and if `canDispatch` returns `true` it will call `dispatch` where any custom logic may reside that handles or routes messages.