---
id: module-kafka
title: Kafka
---

## kafkaSource

The `kafkaSource` function creates a new input source that receives messages from Kafka. The example below joins the consumer group `consumer-group-1` and receives JSON encoded messages from topics `topic1`, `topic2` and `topic3`.

```typescript
Application.create()
    .input()
        .add(kafkaSource({
            broker: "my-kafka-broker:9092",
            encoder: new JsonMessageEncoder(),
            group: "consumer-group-1",
            topics: "topic1, topic2, topic3",
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| name                        | description                                                                                    |
|-----------------------------| ---------------------------------------------------------------------------------------------- |
| broker                      | the DNS name including port of one Kafka broker to connect to                                  |
| encoder                     | defines how the raw data received from Kafka should be converted into message objects          |
| group                       | the name of the consumer group to join                                                         |
| topics                      | a list of topics to consume from                                                               |
| _offsetCommitInterval_      | defines how often offsets will be committed to Kafka, the default values is 5 seconds          |
| _consumeTimeout_            | sets max.poll.interval.ms, the default value is 50ms                                           |
| _maxBytesPerPartition_      | sets max.partition.fetch.bytes, the default value is 10MiB                                     |
| _sessionTimeout_            | sets session.timeout.ms, the default value is 30000ms (30s)                                    |
| _preprocessor_              | optional preprocessing function that allows for manipulation of the incoming message before decoding the message's payload. This can for instance be used for messages that are enveloped in some way |

### OffsetResetStrategy

Each topic can be configured with a `OffsetResetStrategy` that determines at which point in the message stream to start consuming

| name              | description |
|-------------------|-------------|
| Earliest          | if no stored offsets are available for the consumer group, it will start consuming from the earliest message available on the Kafka broker |
| Latest            | if no stored offsets are available for the consumer group, it will start consuming from the latest message available on the Kafka broker   |
| AlwaysEarliest    | ignores stored offsets and will start consuming from the earliest message available on the Kafka broker |
| AlwaysLatest      | ignores stored offsets and will start consuming from the latest message available on the Kafka broker   |

The `OffsetResetStrategy` can be configured along with the topics like this `"topic1|earliest, topic2|always-latest"`, etc.

### Metadata

The following metadata is available in the message handler via `ctx.metadata<T>(key)`

| name                     | description |
|--------------------------|-------------|
| KafkaMetadata.Topic      | the name of the topic the messages was received from |
| KafkaMetadata.Offset     | the offset of the message on its topic/partition |
| KafkaMetadata.Partition  | the partition number the message belongs to |
| KafkaMetadata.Key        | the key associated with the message |
| KafkaMetadata.Timestamp  | the date/time when the broker originally received the message |

### Metrics

| Name                                        | Description | Type | Tags |
| ------------------------------------------- | ----------- | ---- | ---- |
| cookie_cutter.kafka_consumer.request_queue_size | the number of pending network requests to brokers | `gauge` | `topic`, `partition` |
| cookie_cutter.kafka_consumer.incoming_batch_size | number of messages received from broker in a single fetch request | `gauge` | |
| cookie_cutter.kafka_consumer.offset_committed | the last offset that was committed to the broker | `gauge` | `topic`, `partition` |
| cookie_cutter.kafka_consumer.offset_high_watermark | the current high watermark offset | `gauge` | `topic`, `partition` |
| cookie_cutter.kafka_consumer.offset_low_watermark | the current low watermark offset | `gauge` | `topic`, `partition` |
| cookie_cutter.kafka_consumer.lag | the delta between high watermark offset and committed offset | `gauge` | `topic`, `partition` |

## kafkaSink

The 'kafkaSink' function creates an output sink that handles published messages.

```typescript
Application.create()
    .output()
        .published(kafkaSink({
            broker: "my-kafka-broker:9092",
            encoder: new JsonMessageEncoder(),
            defaultTopic: "topic1",
        }))
        .done()
    // ...
    .run();
```

### Configuration

The available configuration options are

| name                        | description                                                                                    |
|-----------------------------| ---------------------------------------------------------------------------------------------- |
| broker                      | the DNS name including port of one Kafka broker to connect to                                  |
| encoder                     | defines how the raw data received from Kafka should be converted into message objects          |
| defaultTopic                | the name of the topic to publish to if no other topic was specified in the message handler     |

### Publishing to Kafka

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
            }, { [KafkaMetadata.Topic]: "my-topic" });

            // explicitly set the key (recommended to always do that)
            ctx.publish(Output, {
                field: "value",
            }, { [KafkaMetadata.Key]: "xyz" });
        }
    })
    .output()
        .published(kafkaSink({
            broker: "my-kafka-broker:9092",
            encoder: new JsonMessageEncoder(),
            defaultTopic: "topic1",
        }))
        .done()
    // ...
    .run();
```

### Metadata

| name                           | description |
|--------------------------------|-------------|
| KafkaMetadata.Topic            | the name of the topic to publish to  |
| KafkaMetadata.Key              | the key to associate with the message, by default it will use the input message's `EventSourcedMetadata.Stream` if available, or `null` (=round robin assignment to partitions) otherwise |

### Metrics

| Name                                        | Description | Type | Tags |
| ------------------------------------------- | ----------- | ---- | ---- |
| cookie_cutter.kafka_producer.msg_published | the number of messages sent to brokers | `increment` | `topic`, `event_type`, `partition`, `result` |
