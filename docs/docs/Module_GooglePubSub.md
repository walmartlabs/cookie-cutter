---
id: module-google-pubsub
title: Google PubSub
---

## pubSubSource

The `pubSubSource` function creates a new input source that receives messages from Google PubSub. The example below subscribes to the subscription `subscription-name-1` and receives JSON encoded messages sent to that subscription.

```typescript
Application.create()
    .input()
        .add(pubSubSource({
            projectId: "project-name-1",
            clientEmail: "myEmail@myserver.com",
            privateKey: "myPrivateKey",
            encoder: new JsonMessageEncoder(),
            subscriptionName: "subscription-name-1"
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| Name   | Description   |
| ------ | ------------- |
| projectId | project ID where subscription is present |
| clientEmail | serivce account email ID that is authorized to access project resources |
| privateKey | private key used to authenticate access |
| encoder | defines how the raw data received from Kafka should be converted into message objects |
| subscriptionName | name of subscription to subscribe to in order to receive messages |
| _maxMsgBatchSize_ | the max number of unacknowledged messages that client can have at a time, default value is 20 |
| _preprocessor_ | optional preprocessing function that allows for manipulation of the incoming message before decoding the message's payload. This can for instance be used for messages that are enveloped in some way |

### Metadata

| Name | Description |
| ---- | ----------- |
| EventSourcedMetadata.EventType | the event that originally generated the message |
| EventSourcedMetadata.Timestamp | the date/time when the topic originally received the message |

### Metrics

| Name | Description | Type | Tags |
| ---- | ----------- | ---- | ---- |
| cookie_cutter.pubsub_source.msg_received | increases the number of messages received from subscription | `increment` | `subscription_name`, `event_type`, `result`[^1] |

## pubSubSink

The `pubSubSink` function creates an output sink that handles messages needed to be published to topic.

```typescript
Application.create()
    .output()
        .published(pubSubSink({
            projectId: "prject-name-1",
            clientEmail: "myEmail@myserver.com",
            privateKey: "myPrivateKey",
            encoder: new JsonMessageEncoder()
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| Name | Description |
| ---- | ----------- |
| projectId | project ID where subscription is present |
| clientEmail | serivce account email ID that is authorized to access project resources |
| privateKey | private key used to authenticate access |
| encoder | defines how the raw data received from Kafka should be converted into message objects |
| _defaultTopic_ | publish to this topic when the message has no topic explicitly mentioned |
| _maximumBatchSize_ | the number of messages handled per batch, default is 1000 |
| _maximumBatchWaitTime_ | maximum time in ms to hold a batch until being published to a topic , default is 100ms |
| _maxPayloadSize_ | maximum size of batch in bytes, default is 5242880 bytes |

### Publishing to PubSub

```typescript
Application.create()
    .dispatch({
        onSomeInputMessage(msg: ISomeInputMessage, ctx: IDispatchContext) {
            // publish a message to the default topic
            ctx.publish(Output, {
                field: "value",
            });

            // publish a message to a different topic
            ctx.publish(Output, {
                field: "value",
                metadata: { PubSubMetadata.Topic: "my-topic" },
            }, );
        }
    })
    .output()
        .published(pubSubSink({
            projectId: "prject-name-1",
            clientEmail: "myEmail@myserver.com",
            privateKey: "myPrivateKey",
            encoder: new JsonMessageEncoder()
        }))
        .done()
    // ...
    .run();
```

### Metatdata

| Name | Description |
| ---- | ----------- |
| PubSubMetadata.Topic | the name of topic to publish |

### Metrics

| Name | Description | Type | Tags |
| ---- | ----------- | ---- | ---- |
|  cookie_cutter.pubsub_sink.msg_published | increases the number of messages published | `increment` | `topic`, `event_typ`, `result`[^1] |


[^1]: `result` - Consists of the following

    | Name | Description |
    | ---- | ----------- |
    | PubSubMetricResults. Success | successfully pusblished/read message from topic/subscription |
    | PubSubMetricResults.Error | error while publishing/reading message from topic/subscription |