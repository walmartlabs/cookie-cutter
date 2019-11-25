---
id: comp-tracing
title: Tracing
---

Cookie Cutter supports APM (application performance monitoring / distributed tracing) out of the box for any opentracing (https://opentracing.io/) based APM backend. All messages flowing through a Cookie Cutter service will carry information about the originating `SpanContext` and the framework will create a child span for every message handled by a service.

## Tracing Builders

In order for Cookie Cutter to connect to an APM backend you will need to configure an opentracing compatible tracer builder during application setup

```typescript
Application.create()
    .tracer(jaeger(/* config */))
    // ...
    .run();
```

A tracing backend is implemented with the following interface

```typescript
import { Tracer } from "opentracing";

export interface ITracerBuilder {
    create(): Tracer;
}
```

## Customizing Traces

Message Handlers have the ability to customize the traces emitted by Cookie Cutter

```typescript
async function onMyInput(msg: IMyInput, ctx: IDispatchContext): Promise<void> {
    // add custom tags to the span that was created for
    // processing this message ... this can be used for filtering
    // in the APM backend application
    ctx.trace.addTags({
        customerId: msg.customerId,
    });

    // create another child span
    const span = ctx.trace.child("operation X");
    try {
        // ... do something ...
    } finally {
        span.finish();
    }

    // pass the current SpanContext to another library
    await someHttpLibrary.get("http://temp.uri", ctx.trace.context);
}
```

## Core Tracing

Services that setup a tracer will by default create two individual traces as part of the input message processing and output message processing steps for all message processing modes.

| Name                                        | Description | Tags |
| ------------------------------------------- | ----------- | ---- |
| Handling Input Message | A span tracing how long it took to dispatch to a handler and finish regardless of outcome. If an input source message contains a parent `spanContext` then this becomes a child span of that parent. | `processing.strategy`, `event.type`, `component`
| Sending to Output Messages Sink | A span tracing how long it took to complete a sink operation for both `store`_d_ and `publish`_ed_ messages. If an input source message contains a parent `spanContext` then this becomes a child of that parent. | `event_type`, `result`

When a message is dispatched to a handler the `Handling Input Message` span created for each incoming input message is passed down to the handler so that users can create additional child spans as necessary for handler specific operations users care about as described in [Customizing Traces](Comp_Tracing.md#customizing-traces).
For any `store`_d_ or `publish`_ed_ messages, this same span is attached to the message and is used in any subsequent sink operations that have tracing in them and is available for users that leverage when creating their own custom sink.
Additional tracing details for how sinks handle that span can be found on the module specific pages.

The `component` tag for the above spans will always be `cookie-cutter-core`.
Should an operation for a span fail, a log message will be attached to the span along with a `message` and `error` tag set.