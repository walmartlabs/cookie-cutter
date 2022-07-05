---
id: module-mqtt
title: MQTT
---

## mqttSource

The `mqttSource` function creates a new input source that receives messages from MQTT broker. The example below subscribes to topic `test-topic` on a MQTT broker `test-broker` that listens on port `1234` and receives JSON encoded messages sent to that topic.

```typescript
Application.create()
    .input()
        .add(mqttSource({
            hostName: "test-broker",
            hostPort: "1234",
            ecnoder: new JsonMessageEncoder(),
            topic: "test-topic",
        }))
        .done()
    //  ...
    .run();
```

### Configuration

The available configuration options are

| Name | Description |
| ---- | ----------- |
| hostName | MQTT broker's host name |
| hostPort | MQTT broker's host port where the service is listening on |
| encoder | defines how the raw data received from MQTT broker should be converted into message objects |
| topic | name of the subscribed topic where the message was received from |
| _prepreprocessor_ | optional preprocessing function that allows for manipulation of the incoming message before decoding the message's payload. This can for instance be used for messages that are enveloped in some way |
| _queueSize_ | the max number of messages that are being processed at a time, default value is 10 |
| _qos_ | quality of service that can `only` take values 0, 1, and 2. Default value is 0  |

### Metadata

| Name | Description |
| ---- | ----------- |
| EventSourcedMetadata.EventType | the event that originally generated the message |
| EventSourcedMetadata.Timestamp | the date/time when the topic originally received the message |
| MqttMetadata.topic | the topic where this message was received from |

### Metrics

| Name | Description | Type | Tags |
| ---- | ----------- | ---- | ---- |
| cookie_cutter.mqtt_source.msg_received | increases the number of messages received from topic | `increment` | `topic`, `eventType`, `port`, `hostName`, `result`[^1] |

## mqttSink

The `mqttSink` function creates an output sink that handles messages needed to be published to a topic on the broker.

```typescript
Application.create()
    .output()
        .published(mqttSink({
            hostName: "test-broker",
            hostPort: "1234",
            ecnoder: new JsonMessageEncoder(),
            topic: "test-topic",
        }))
        .done()
    // ....
    .run();
```

### Configuration

The available configuration options are

| Name | Description |
| ---- | ----------- |
| hostName | MQTT broker's host name |
| hostPort | MQTT broker's host port where the service is listening on |
| encoder | defines how the raw data received from MQTT broker should be converted into message objects |
| topic | name of the subscribed topic where the message was received from |
| _qos_ | quality of service that can `only` take values 0, 1, and 2. Default value is 0  |

### Publishing to Mqtt broker

```typescript
Application.create()
    .dispatch({
        onSomeInputMessage(msg: ISomeInputMessage, ctx: IDispatchContext) {
            // publish a message to a topic
            ctx.publish(Output, {
                field: "value",
            });
        }
    })
    .output()
        .published(mqttSink({
            hostName: "test-broker",
            hostPort: "1234",
            ecnoder: new JsonMessageEncoder(),
            topic: "test-topic",
        }))
        .done()
    // ...
    .run ();
```

### Metrics

| Name | Description | Type | Tags |
| ---- | ----------- | ---- | ---- |
| cookie_cutter.mqtt_sink.msg_published | increases the number of messages published to topic | `increment` | `topic`, `eventType`, `result`[^1] |

[^1]: `result` - Consists of the following
    | Name | Description |
    | ---- | ----------- |
    | MqttMetricResults.success | successfully published/received message from broker/topic |
    | MqttMetricResults.error | error while  publishing/reading message from broker/topic |