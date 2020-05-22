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