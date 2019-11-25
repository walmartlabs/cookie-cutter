# 1.1-rc

## core

### Redesign of Retry Logic

The retry logic was redesigned to make it easier to distinguish between errors that should be retried and those that shouldn't. Sinks receive a `bail` function as a parameter now that can be called when retries should stop.

```typescript
class MySink implements IOutputSink<IPublishedMessage> {
    public async sink(items: IterableIterator<IPublishedMessage>, bail: (err: any) => never) {
        try {
            await someOperation(...);
        } catch (e) {
            if (e instanceof SomethingThatDoesNotMakeSenseToRetry) {
                bail(e);
            }

            throw e; // this will be retried
        }
    }
}
```

The same concept can be applied to message handlers

```typescript
class MyHandler {
    public async function onSomeInput(msg: ISomeInput, ctx: IDispatchContext) {
        if (msg.apiVersion > 2) {
            ctx.bail(new Error("API version not supported"));
        }
    }
}
```

In addition to this the number of retries per message is now configurable via `IApplicationBehavior` and the `ErrorHandlingMode`_s_ were changed to

```typescript
export enum ErrorHandlingMode {
    LogAndContinue = 1,
    LogAndRetry,
    LogAndFail,
    LogAndRetryOrContinue,
    LogAndRetryOrFail,
}
```

`LogAndRetry` maps to an infinite number of retries (the application fails when a non-retriable error is encountered). `LogAndRetryOrContinue` vs. `LogAndRetryOrFail` define what is supposed to happen if the allowed number of reties is exceeded (either fail the application or continue with the next message). The default number of retries is 5. `LogAndContinue` and `LogAndFail` work the same but set the retries to zero.

### Metric for Number of Concurrently Active Message Handlers in RPC Mode

A new gauge metric is emitted when running in RPC mode that shows the number of concurrently active message handler functions.

### DefaultComponentContext

The `DefaultComponentContext` class was added that can be used as a default by any implementor of `IRequireInitialization` until `initialize` is called. This is mainly handy for unit tests as it removes the requirement to explicitly initialize components with `NullLogger`_s_, `NullMetric`_s_, etc ...

## azure

### Timeout for BlobClient

The timeout for put requests is now configurable for the Blob Storage client.

### JSON Embeddings

JSON Embeddings are now supported by all Azure Cosmos sinks. When the `JsonMessageEncoder` is used for any sink the document in Cosmos DB will properly reflect the JSON vs. storing the JSON in serialized form as a `UInt8Array`.

## kafka

* LZ4 compressed messages are supported out of the box now
* new metrics for low/high watermarks, committed offsets and current lag are emitted
* kafkajs was upgraded to 1.10.0

## kubernetes

* Kubernetes Validation Hooks are now supported

## validatejs

* improve definition of 'required' to catch empty strings

## gcp

* initial version

## lightstep

* initial version

## redis

* initial version

# 1.0

* initial release

## Bug Fixes

### core

* 1.0.1: ensure SequenceConflictError excludes its 'context' property when serialized
* 1.0.2: add missing optimistic concurrency check when event handler does not produce any output

### azure

* 1.0.1: handle response being null/undefined in BlobClient callbacks
* 1.0.2: update QueueInputSource to support protobuf encoded data that is stored as an object
* 1.0.3: fixed typo in variable name in upsert stored procedure
* 1.0.4: support new optimistic concurrency checks (see core v1.0.2)
* 1.0.5: upgrade @cookie-cutter/core dependency
* 1.0.6: fixed infinite loop in materialized view sink introduced with 1.0.4
* 1.0.7: fixed bad deployment of 1.0.6 package

### instana

* 1.0.1: upgrade to @instana/collector@1.68.2 for bug fix for errors with cyclic data
* 1.0.2: upgrade @cookie-cutter/core dependency

### kafka

* 1.0.1: fixed Kafka headers aren't properly decoded
* 1.0.2: upgrade @cookie-cutter/core dependency
* 1.0.3: fixed dispose function to check whether the kafka client was initialized before closing it
* 1.0.4: fixed span hydration to correctly use default headers
* 1.0.5: fixed snappy codec setup that did not work properly
* 1.0.6: fixed bad deployment of 1.0.5 package

### kubernetes

* 1.0.1: upgrade @cookie-cutter/core dependency

### mssql

* 1.0.1: upgrade @cookie-cutter/core dependency
* 1.0.2: fixed dispose function to check whether the mssql client was initialized before closing it

### proto

* 1.0.1: upgrade @cookie-cutter/core dependency

### s3

* 1.0.1: upgrade @cookie-cutter/core dependency

### statsd

* 1.0.1: upgrade @cookie-cutter/core dependency
* 1.0.2: fixed dispose function to check whether the statsd client was initialized before closing it

### timer

* 1.0.1: upgrade @cookie-cutter/core dependency

### validatejs

* 1.0.1: upgrade @cookie-cutter/core dependency
