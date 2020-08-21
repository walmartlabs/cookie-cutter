---
id: module-redis
title: Redis
---

The Redis module allows services to write to a Redis store or retrieve data from there.

## Client

The `redisClient` can be used to load or store data directly within a message handler function.

```typescript
Application.create()
    // ...
    .services()
        .add("redis", redisClient({ /* configuration */ }))
        .done()
    .dispatch({
        onIMyObject: async (msg: IMyObject, ctx: IDispatchContext): Promise<void> => {
            const redis = ctx.services.get<IRedisClient>("redis");

            // write/overwrite the object associated with a key
            await redis.putObject(ctx.trace.context, IMyObject, msg, "some-key");

            // retrieve the object associated with a key (returns undefined if no such key)
            const msg = await redis.getObject(ctx.trace.context, IMyObject, "some-key");
        },
    })
    .run();
```

### Configuration

| Name | Description |
|------|-------------|
| host | the HTTP endpoint to connect to |
| port | the port to connect to. Default is 6379  |
| db | index of the database to connect to |
| _encoder_ | the encoder to use when converting the payload to a byte array. This defaults to the `NullMessageEncoder` which only supports Buffers (=byte arrays) being published |
| _typeMapper_ | only required if correct type information needs to be emitted |

### Metrics

| Name                                        | Description | Type | Tags |
| ------------------------------------------- | ----------- | ---- | ---- |
| cookie_cutter.redis_client.get | A call to get a value | `increment` | `type`, `db`, `result`
| cookie_cutter.redis_client.set | A call to set a value | `increment` | `type`, `db`, `result`

## redisStreamSource

The `redisStreamSource` function creates a new input source that receives messages from Redis. The example below joins the consumer group `consumer-group-1` and receives JSON encoded messages from streams `stream1`, `stream2` and `stream3`.

```typescript
    Application.create()
        .input()
        .add(redisStreamSource({
                host: "localhost",
                port: 6379,
                db: 0,
                readStreams: ["stream1", "stream2", "stream3"],
                consumerGroup: "consumer-group-1",
        }))
        .done()
        // ...
        .run();
```

### Configuration

| Name | Description |
|------|-------------|
| host | the HTTP endpoint to connect to |
| port | the port to connect to. Default is 6379  |
| db | index of the database to connect to |
| _encoder_ | the encoder to use when converting the payload to a byte array. This defaults to the `NullMessageEncoder` which only supports Buffers (=byte arrays) being published |
| _typeMapper_ | only required if correct type information needs to be emitted |
| readStreams | a list of stream names to consume from |
| consumerGroup | the name of the consumer group to join |
| _consumerId_ | the id of consumer to use, the default value is a generated guid |
| _consumerGroupStartId_ | the ID of the last item in the stream to consider already delivered, the default value is `$` (the ID of the last item in the stream) |
| _blockTimeout_ | the number of milliseconds we want to block before timing out, the default values is 100 ms |
| _idleTimeout_ | the minimum number of milliseconds of idle time a pending message should have before we try to claim it, the default value is 30000 ms (30s) |
| _batchSize_ | the number of messages receive at a time when consuming streams, the default values is 10 |

### Metadata

The following metadata is available in the message handler via `ctx.metadata<T>(key)`

| name                     | description |
|--------------------------|-------------|
| RedisMetadata.StreamName | the name of the stream the messages was received from |
| RedisMetadata.MessageId | the id of the message that was received |

### Metrics

| Name                                        | Description | Type | Tags |
| ------------------------------------------- | ----------- | ---- | ---- |
| cookie_cutter.redis_consumer.input_msg_received | number of messages received from redis server | `increment` | `stream_name`, `consumer_group`
| cookie_cutter.redis_consumer.input_msg_processed | number of messages processed | `increment` | `stream_name`, `consumer_group`, `result`
| cookie_cutter.redis_consumer.input_msgs_claimed | number of pending messages claimed  | `increment` | `stream_name`, `consumer_group`
| cookie_cutter.redis_consumer.pending_msg_size | number of pending messages found | `gauge` | `stream_name`, `consumer_group`
| cookie_cutter.redis_consumer.incoming_batch_size | number of messages received from redis server in a single fetch request | `gauge`

## redisStreamSink

The 'redisStreamSink' function creates an output sink that handles published messages.

```typescript
Application.create()
    .output()
        .published(redisStreamSink({
                    host: "localhost",
                    port: 6379,
                    db: 0,
                    writeStream: "streamName",
        }))
        .done()
    // ...
    .run();
```
### Configuration

| Name | Description |
|------|-------------|
| host | the HTTP endpoint to connect to |
| port | the port to connect to. Default is 6379  |
| db | index of the database to connect to |
| _encoder_ | the encoder to use when converting the payload to a byte array. This defaults to the `NullMessageEncoder` which only supports Buffers (=byte arrays) being published |
| _typeMapper_ | only required if correct type information needs to be emitted |
| writeStream | the name of the stream to publish to if no other stream name was specified in the message handler |

### Metadata

The following metadata is available in the message handler via `ctx.publish`

| name                     | description |
|--------------------------|-------------|
| RedisMetadata.StreamName | the name of the stream to publish to |

### Metrics

| Name                                        | Description | Type | Tags |
| ------------------------------------------- | ----------- | ---- | ---- |
| cookie_cutter.redis_producer.msg_published | the number of messages sent to redis server | `increment` | `stream_name`, `result` |