---
id: comp-metrics
title: Metrics
---

Services will want to record metrics to track error rates for message processing, counts for incoming and outgoing messages, or anything internal to the state of service itself. Cookie Cutter provides a general purpose metrics recorder that can be connected to various backends. The framework already emits many useful metrics out of the box; Custom metrics can be emitted by message handlers, custom input sources, output sinks or state providers.


```typescript
export interface IMetricTags {
    readonly [key: string]: any;
}

export interface IMetrics {
    increment(key: string, tags?: IMetricTags): void;
    increment(key: string, value: number, tags?: IMetricTags): void;
    gauge(key: string, value: number, tags?: IMetricTags): void;
    timing(key: string, value: number, tags?: IMetricTags): void;
}
```

## Metrics from a Message Handler

Below is an example of a custom metric that records how much money is spent in an online shop and allows the data to be graphed on a time interval. The `region` tag can be used to further slice the data when visualizing it (e.g. one line per region on a time chart). 

```typescript
function onOrderPlaced(msg: IOrderPlaced, ctx: IDispatchContext): void {
    ctx.metrics.increment("$ spent", msg.amount, {
        region: msg.customer.address.state,
    });
}
```

Metrics recorded inside of a message handler do not immediately get published by the underlying metrics recorder. Similarly to the [DispatchContext](Comp_DispatchContext.md#publish-store) within a message handler, metrics will be buffered and only after the message handler function successfully returns will it pass the set of recorded metrics to the metrics recorder for publishing. Any message handlers that throw an error will clear any metrics that have been buffered.

## Metric Annotators

Metric Annotators allow services to add additional tags to the metrics emitted by the core framework. An example where this can be useful are multi tenant systems where every message processed contains the tenant id and we would like to be able to monitor our SLAs per tenant.

```typescript
export interface IMessageMetricAnnotator {
    annotate(msg: IMessage): IMetricTags;
}

class MyMetricAnnotator implements IMessageMetricAnnotator {
    public annotate(msg: IMessage): IMetricTags {
        return {
            tenantId: msg.payload.tenantId,
        };
    }
}

Application.create()
    .input()
        .add(/* some input source */)
        .annotate(new MyMetricAnnotator())
        .done()
    // ...
    .run();
```

## Core Metrics

Services that setup a metrics recorder will by default collect a few different metrics listed below as part of the normal input-dispatch-output message flow. Depending on the message processing mode additional metrics may be collected.

| Name                                        | Description | Message Processing Mode | Type | Tags |
| ------------------------------------------- | ----------- | ----------------------- | ---- | ---- |
| cookie_cutter.core.received | A message that has come off the wire that a dispatch handler exists for | All | `increment` | `event_type`
| cookie_cutter.core.processed | A message that has been processed | All | `increment` | `event_type`, `result`
| cookie_cutter.core.store | A stored message was processed by an output sink | All | `increment` | `event_type`, `result`
| cookie_cutter.core.publish | A published message was processed by an output sink | All | `increment` | `event_type`, `result`
| cookie_cutter.core.input_queue | The number of messages that have come off the wire waiting to be handled | Concurrent & Rpc | `gauge` | None
| cookie_cutter.core.output_queue | The number of buffered dispatch contexts waiting to be processed by the output loop | Concurrent & Rpc | `gauge` | None
| cookie_cutter.core.output_batch | The number of buffered dispatch contexts that have been batched within the output loop waiting to be processed by an output sink | Concurrent & Rpc | `gauge` | None
| cookie_cutter.core.concurrent_handlers |  The number of handlers currently executing concurrently | Rpc | `gauge` | None