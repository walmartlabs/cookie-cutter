# 1.5

## CI/CD
- Run build steps on Node 16 instead of Node 10. Minimum Node is now 12.0.0.
- Keep a build step running on Node 12 for backwards compatibility.

## All packages
- Update most dependencies to the latest patch version.

## azure
- Fix: message encoding/decoding inconsistency between `@azure/storage-queue` (in 1.4.0) and `azure-storage` (in 1.3.0 and lower).

## core
- Add logs to composite input source to debug erroring sources.

## gcp
- Add a PubSub source.

## grpc
- Remove the result of `call.getPeer()` from the metrics tags to reduce the cardinality of metrics.

## kafka
- Add an optional client id prefix for the automatically generated `clientId`.
- Add an optional parameter that specifies additional header names to be pulled into the message metadata.

## redis
- Replace `shortid` with `nanoid` for generating the `consumerId`.

# 1.4

## CI/CD
- Switch from Travis to Github Actions

## azure
- Expose `IBlobClient` interface

    ```typescript
    export interface IBlobClient extends IRequireInitialization {
        createContainerIfNotExists(context?: SpanContext): Promise<boolean>;
        write(context: SpanContext, blobId: string, content: Buffer | string): Promise<void>;
        readAsText(context: SpanContext, blobId: string): Promise<string>;
        exists(context: SpanContext, blobId: string): Promise<boolean>;
        deleteFolderIfExists(context: SpanContext, folderId: string): Promise<boolean>;
        deleteBlobIfExists(context: SpanContext, blobId: string): Promise<boolean>;
        listBlobs(context: SpanContext, prefix: string): AsyncIterableIterator<string>;
    }
    ```
- Run integration tests via emulators for Cosmos DB and Azure Storage in a Windows VM
- Expose `ICosmosDocument` field `ttl` in order to allow setting time-to-live for Cosmos DB documents
- Fix: don't extract data field in QueueInputSource when encoder isEmbeddable
- Fix: handle the `url` and `connectionString` fields of `IQueueConfiguration` correctly as separate fields

## gcp
- Log a detailed error message when an error occurs while inserting data into BiqQuery
- Fix: pass error.message instead of error object to increment metric

## grpc
- Fix: pass correct time value to the `RequestProcessingTime` timing metric

## kafka
- Add TLS support
- Expose compression modes setting in kafkaSink: `None`, `Gzip`, `Snappy`, `LZ4`
- Expose KafkaJS Client Configuration fields: `connectionTimeout` and `requestTimeout`
- Fix: properly connect/disconnect KafkaJS producer
- Fix: properly export `IRawKafkaMessage`

## mssql
- Update mssql from `4.x.x` to `6.x.x`
- Expose connection configuration fields: `connectionTimeout`, `requestTimeout` and `stream`
- Add schema support for Sproc and Table mode
- Add bulk insert support for Table mode

## prometheus
- Fix: properly export `IPrometheusConfiguration`

## redis
- Fix: redis client no longer stops processing messages in a batch when it encounters an invalid message
- Fix: force application to restart on unexpected redis disconnect because reconnect doesn't seem to work properly
- Fix: log correct error when redis ack fails
- Fix: pass RedisError type instead of Error object to increment metric

# 1.3

## core

- fixed bug where BoundedPriorityQueue could de-prioritize elements under certain circumstances which could lead to out-of-order processing
- deprecated support for Node v8

## kafka

- detect stale broker metadata and crash kafkajs client; this seems to be a bug in kafkajs where the metadata can get stale and all reconnect attempts of kafkajs will fail.

## prometheus

- allow negative values for histograms

## kubernetes

- less verbose logging

## amqp

- new module with sink and source for AMQP compatible message buses

## protobuf

- support embedding encoded protobuf data as base64 in JSON documents

## redis

- support multiple streams for source and sink
- added missing metrics
- fix messages getting lost when receiving in batches

## azure

- support accessing multiple cosmos collection from within the same service
- added support for dead letter queues for Azure Queues

## mssql

- fixed sink swallows actual error message when a transaction fails to commit


# 1.2

## core

### Richer API for Retries

The retry feature that was added in version 1.1 has been extended to allow message handlers and sinks to get access to metadata about the retry loop and overwrite retry intervals.

```typescript
export class MyMessageHandler {
    public async function onSomeInput(msg: SomeInput, ctx: IDispatchContext) {
        try {
            // currentAttempt, maxAttempts, isFinalAttempt
            // are automatically included in all errors
            // logged by Cookie Cutter
            ctx.logger.info("attempting to invoke API", {
                currentAttempt: ctx.retry.currentAttempt,
                maxAttempts: ctx.retry.maxAttempts,
                isFinalAttempt: ctx.retry.isFinalAttempt(),
            });

            await someApi.invoke(msg);
        } catch (e) {
            if (e instanceof ServiceUnavailableError) {
                ctx.retry.bail(e);
            } else if (e instanceof RetryLaterError) {
                ctx.retry.setNextRetryInterval(e.retryAfterMs);
            }

            throw e;
        }
    }
}

export class MySink implements IOutputSink<IPublishedMessage> {
    public async sink(items: IterableIterator<IPublishedMessage>, retry: IRetrierContext) {
        // use `retry` the same way as in message handler example above
    }
}
```

### Evicting In-Flight Messages

Kafka's rebalance protocol dictates that every consumer must complete processing all in-flight messages and commit its offsets _before_ acknowledging a rebalance back to the broker. In order to be compliant with this requirement we added a new feature for input sources that allows them to evict pending messages from the input queue and wait for all messages, that are currently being processed, to complete.

Full compliance for the Kafka input source is currently still blocked by an open ticket in the `kafkajs` side. There is currently a race condition where evicted items may still be around after the synchronization barrier for the rebalance was crossed.

```typescript
export class MyInputSource implements IInputSource {
    public async *start(ctx: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        // --- PSEUDO code for a Kafka client ---

        this.client.onRebalance(async () => {
            // this will clear all messages from the input queue
            // and wait for all other messages to complete processing
            await ctx.evict((msg) => isFromKafkaInputSource(msg));
            await this.client.commitOffsets();
        });

        while (const msg = await this.client.next()) {
            yield new MessageRef({}, msg);
        }
    }
}
```

### MockMaterializedState

You can now test applications with materialized views more easily.

```typescript
function createTestApp(): IApplicationBuilder {
    return Application.create()
        .dispatch(new MessageHandler())
        .state(
            mockMaterializedState(Customer, {
                "customer-1": new Customer({ name: "John Doe" }),
                "customer-2": new Customer({ name: "Jane Doe" }),
            })
        );
}
```

### Better Throughout in RPC Mode

When a Cookie Cutter Applications runs in RPC mode and encounters a Sequence Conflict, it will no longer retry all messages that follow the one that triggered the Sequence Conflict. However, Cookie Cutter still guarantees that the output state is correct, even when competing events are handled in parallel.

| Mode | Guarantees | Notes |
|------|------------|-------|
| Serial | * Ordering<br/>* Correctness of State | Inefficient due to serial nature of I/O, this mode should generally not be used |
| Concurrent | * Ordering<br/>* Correctness of State | Efficient I/O with guaranteed ordering, good for stream processing
| RPC | * Correctness of State | Efficient I/O, handling multiple requests in parallel while guaranteeing correctness of state -> good for gRPC services |

### Custom Handling of Invalid Messages

It is now possible to customize how invalid messages are handled. The example below reroutes all invalid messages to a dedicated Kafka queue.

```typescript
Application.Create()
    .input()
        .add(new SomeInput())
        .done()
    .validate(withValidateJs(...))
    .dispatch({
        invalid: async (msg: IMessage, ctx: IDispatchContext) {
            ctx.publish(msg.payload, { [KafkaMetadata.Topic]: "invalid-messages" });
        }
    })
    .run()
```

## azure

-   use the new retry API (see above) to overwrite the next retry interval when reaching RU limits with Microsoft's suggested retry interval from the HTTP header of the response
-   upgrade to @cosmos/azure version 3.0
-   expose `url` as configuration for Blob Storage (useful for testing with Microsoft's Emulator Docker image)
-   support for message pre-processing for Azure Queue data (similar to the pre-processor in the Kafka module)
-   Allow opt-in to creating Azure queues dynamically on write

## kafka

-   Implemented eviction of pending messages with new mechanism described above. KafkaJS currently does not provide an async callback on rebalance, so this is still not compliant with Kafka's rebalance protocol until that is resolved (see https://github.com/tulios/kafkajs/issues/592), but should already make rebalances smoother for slow consumers and avoid committed offsets moving backwards
-   support multiple bootstrap brokers
-   make session timeout configurable so slow consumers don't trigger unnecessary rebalances.

## kubernetes

-   implemented workaround for watch stopping to work after some time period

## grpc

-   better error message when connection fails
-   automatically retry intermittent errors

## prometheus

-   initial support for collecting metrics via Prometheus

# 1.1

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

-   LZ4 compressed messages are supported out of the box now
-   new metrics for low/high watermarks, committed offsets and current lag are emitted
-   kafkajs was upgraded to 1.10.0

## kubernetes

-   Kubernetes Validation Hooks are now supported

## validatejs

-   improve definition of 'required' to catch empty strings

## gcp

-   initial version

## lightstep

-   initial version

## redis

-   initial version

# 1.0

-   initial release

## Bug Fixes

### core

-   1.0.1: ensure SequenceConflictError excludes its 'context' property when serialized
-   1.0.2: add missing optimistic concurrency check when event handler does not produce any output

### azure

-   1.0.1: handle response being null/undefined in BlobClient callbacks
-   1.0.2: update QueueInputSource to support protobuf encoded data that is stored as an object
-   1.0.3: fixed typo in variable name in upsert stored procedure
-   1.0.4: support new optimistic concurrency checks (see core v1.0.2)
-   1.0.5: upgrade @cookie-cutter/core dependency
-   1.0.6: fixed infinite loop in materialized view sink introduced with 1.0.4
-   1.0.7: fixed bad deployment of 1.0.6 package

### instana

-   1.0.1: upgrade to @instana/collector@1.68.2 for bug fix for errors with cyclic data
-   1.0.2: upgrade @cookie-cutter/core dependency

### kafka

-   1.0.1: fixed Kafka headers aren't properly decoded
-   1.0.2: upgrade @cookie-cutter/core dependency
-   1.0.3: fixed dispose function to check whether the kafka client was initialized before closing it
-   1.0.4: fixed span hydration to correctly use default headers
-   1.0.5: fixed snappy codec setup that did not work properly
-   1.0.6: fixed bad deployment of 1.0.5 package

### kubernetes

-   1.0.1: upgrade @cookie-cutter/core dependency

### mssql

-   1.0.1: upgrade @cookie-cutter/core dependency
-   1.0.2: fixed dispose function to check whether the mssql client was initialized before closing it

### proto

-   1.0.1: upgrade @cookie-cutter/core dependency

### s3

-   1.0.1: upgrade @cookie-cutter/core dependency

### statsd

-   1.0.1: upgrade @cookie-cutter/core dependency
-   1.0.2: fixed dispose function to check whether the statsd client was initialized before closing it

### timer

-   1.0.1: upgrade @cookie-cutter/core dependency

### validatejs

-   1.0.1: upgrade @cookie-cutter/core dependency
