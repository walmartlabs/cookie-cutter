---
id: intro-outputs
title: Outputs
---

## Purpose

Output Sinks receive all messages that were either `publish`_ed_ or `store`_d_ from within a message handler. A service may have a single `publish` and/or a single `store` sink - however it is recommended to only use a single (either store or publish) sink as multiple sinks may cause inconsistencies downstream due to non-transactional dual writes.

The main difference between `publish` and `store` is optimistic concurrency, please see [Optimistic Concurrency](OptimisticConcurrency.md) for more details. `BROKEN LINK`

```typescript
export enum OutputSinkConsistencyLevel {
    None = 0,
    Atomic = 1,
    AtomicPerPartition = 2,
}

export interface IOutputSinkGuarantees {
    readonly idempotent: boolean;
    readonly consistency: OutputSinkConsistencyLevel;
    readonly maxBatchSize?: number;
}

export interface IOutputSink<T> {
    sink(output: IterableIterator<T>, retry: RetrierContext): Promise<void>;
    readonly guarantees: IOutputSinkGuarantees;
}
```

## Guarantees

Each sink has to define what kind of guarantees it can make to the framework. The `consistency` level defines if the sink has `Atomic` (think SQL database transactions), `AtomicPerPartition` (think most no-SQL databases that support document level transactions) or `None` (think REST API calls) behavior. The `maxBatchSize` limits the number of elements a sink will receive in a single call, if it's left blank there is no limit. `idempotent` defines whether the `sink` operation can be retried safely without duplicating data, for instance writing a blob of data to AWS S3 is idempotent (writing it once or twice makes no difference to its final state) whereas publishing a message to a message broker is not idempotent.

## Batching

Cookie Cutter tries to batch outputs automatically. A sink may be invoked with a batch that consists of the combined outputs of multiple input messages. This behavior is meant to increase throughput as it is usually more efficient to send more data in one shot than in smaller chunks.

Batching logic will honor the guarantees that a sink defines. For example if a sink is `AtomicPerPartition` a batch will never contain messages for different partitions. Also batches will never exceed the `maxBatchSize`.

## Type Mappers

When `publish`_ing_ or `store`_ing_ an output from a message handler the framework somehow needs to determine what the type name of that output should be.

```typescript
function onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
    ctx.publish(Output, { /* payload */ });
}
```

Cookie Cutter receives the class type / constructor function of the output as the first argument of `publish`/`store`, but somehow needs to translate that into a string value representing that type. The default behavior is to use the name of the class that we can get from the JavaScript runtime, which in the example above would be `Output`. However this behavior might not be desirable if, for instance, the output is a protobuf message. In that case we would prefer the type name to include the full package name of the proto. For that purpose Cookie Cutter has the concept for `Type Mappers` - it translates a constructor function / class type to a string.

```typescript
export interface IMessageTypeMapper {
    map<T>(type: IClassType<T>): string;
}
```

The default implementation for this interface is `ObjectNameMessageTypeMapper` and can be overwritten during application setup

```typescript
Application.create()
    .typeMapper(myCustomerTypeMapper)
    // ...
    .run();
```

## RetrierContext

The RetrierContext allows sinks to communicate with the retrier. Sinks can inform the retrier that it should stop retrying by calling `retry.bail(err: any)`. Sinks can also override the next retry interval by using `retry.setNextRetryInterval(intervalInMs: number)`.

```typescript
interface IRetrierContext {
    // ...
    bail: (err: any) => never;
    setNextRetryInterval: (interval: number) => void;
}
```

```typescript
try {
    await this.client.upsert(record, state.key, state.seqNum);
} catch (e) {
    if (isRetryableError(e)) {
        if (e.headers && e.headers[RETRY_AFTER_MS]) {
            retry.setNextRetryInterval(parseInt(e.headers[RETRY_AFTER_MS], 10));
        }
        throw e;
    } else {
        retry.bail(e);
    }
}
```
