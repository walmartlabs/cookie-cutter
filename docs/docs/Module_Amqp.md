---
id: module-amqp
title: AMQP
---

## amqpSource

The `amqpSource` function creates a new input source that receives messages from `RabbitMQ` or another message broker following the `AMQP 0-9-1` protocol.
The example below starts consuming JSON encoded messages from queue `defaultQueueName`.

```typescript
Application.create()
    .input()
        .add(amqpSource({
            server: {
                host: "localhost",
            },
            queue: {
                name: "defaultQueueName",
            },
            encoder: new JsonMessageEncoder(),
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| name | description |
| ---- | ----------- |
| server.host | host name to connect to |
| _server.port_ | port to connect to (default `5672`) |
| queue.name | name of queue to connect to |
| _queque.durable_ | if `true` (default), queue survives restarts of broker, messages are as persistent as their queue |
| _message.expiration_ | time to live per message in milliseconds (default is no expiration) |
| encoder | defines how the raw data received from AMQP Broker should be converted into message objects |

### Consuming from AMQP Broker

```typescript
Application.create()
    .input()
        .add(amqpSource({
            server: {
                host: "localhost",
            },
            queue: {
                name: "defaultQueueName",
            },
            encoder: new JsonMessageEncoder(),
        }))
        .done()
        .dispatch({
            onSomeInputMessage(msg: ISomeInputMessage, ctx: IDispatchContext) {
                ctx.publish(SomeInputMessage, msg);
            },
        })
    // ...
    .run();
```

### Metadata

The following metadata is available in the message handler via `ctx.metadata<T>(key)`

| name | description |
| ---- | ----------- |
| AmqpMetadata.name | name of queue this message came from |
| AmqpMetadata.Redelivered | indicates that the message has been previously delivered to this or another client. |
| AmqpMetadata.Expiration | message expiration in milliseconds as specified when publishing the message |

### Metrics

| name | description | Type | Tags |
| ---- | ----------- | ---- | ---- |
| cookie_cutter.amqp_consumer.input_msg_received | number of messages received from the broker | `increment` | `host`, `queueName`, `event_type`, `result` |
| cookie_cutter.amqp_consumer.input_msg_processed | number of messages consumed successfully/unsuccessfully | `increment` | `host`, `queueName`, `event_type`, `result` |
| cookie_cutter.amqp_consumer.unassigned_message_count | number of messages in the queue still not assigned to a consumer | `gauge` | `host`, `queueName` |
| cookie_cutter.amqp_consumer.consumer_count | number of consumers for this queue | `gauge` | `host`, `queueName` |

## amqpSink

The `amqpSink` function creates an output sink that handles published messages. The example below starts publishing JSON encoded messages to queue `defaultQueueName`.

```typescript
Application.create()
    // ...
    .output()
        .published(amqpSink({
            server: {
                host: "localhost",
            },
            queue: {
                name: "defaultQueueName",
            },
            encoder: new JsonMessageEncoder(),
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| name | description |
| ---- | ----------- |
| server.host | host name to connect to |
| _server.port_ | port to connect to (default `5672`) |
| queue.name | name of queue to connect to |
| _queque.durable_ | if `true` (default), queue survives restarts of broker, messages are as persistent as their queue |
| _message.expiration_ | time to live per message in milliseconds (default is no expiration) |
| encoder | defines how the raw data received from AMQP Broker should be converted into message objects |

### Publishing to AMQP Broker

```typescript
Application.create()
    .dispatch({
        onSomeInputMessage(msg: ISomeInputMessage, ctx: IDispatchContext) {
            ctx.publish(SomeInputMessage, msg);
        }
    })
    .output()
        .published(amqpSink({
            server: {
                host: "localhost",
            },
            queue: {
                name: "defaultQueueName",
            },
            encoder: new JsonMessageEncoder(),
        }))
        .done()
    // ...
    .run();
```
