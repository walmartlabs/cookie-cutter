---
id: module-s3
title: S3
---

The S3 module allows services to write to any S3 compatible blob storage or retrieve data from there.

## Sink

```typescript
Application.create()
    // ...
    .dispatch({
        onMyInput: (msg: IMyInput, ctx: IDispatchContext) => {
            // this one will work without explicitly specifying a
            // message encoder for s3Sink (we publish a byte array)
            ctx.publish(Buffer, Buffer.fromArray(msg.rawFileContent), {
                [S3Metadata.Key]: "some-key",
            });

            // for this line to work we need to tell s3Sink how the
            // domain object should be encoded when it's stored
            ctx.publish(MyOutput, { foo: "123", bar: 987 }, {
                [S3Metadata.Key]: "some-other-key",
            });

            // additionally we can override the default target 
            // bucket as well on a per-message basis
            ctx.publish(MyOutput, { foo: "123", bar: 987 }, {
                [S3Metadata.Key]: "foo-bar",
                [S3Metdata.Bucket]: "bucket-foo",
            });
        }
    })
    .output()
        .published(s3Sink({
            endpoint: "http://my-s3-server:8080",
            accessKeyId: "XXXXX",
            secretAccessKey: "XXXXX",
            // encoder: new JsonMessageEncoder(),
        }))
        .done()
    .run();
```

## Client

The `s3Client` can be used to load or store data directly within a message handler function.

```typescript
Application.create()
    // ...
    .services()
        .add("s3", s3Client({ /* configuration */ }))
        .done()
    .dispatch({
        onMyInput: async (msg: IMyInput, ctx: IDispatchContext): Promise<void> => {
            const s3 = ctx.services.get<IS3Client>("s3");

            // retrieve and update and existing document
            const obj = await s3.getObject<IMyObject>(ctx.trace.context, "some-key", "some-bucket");
            obj.foo = "bar";
            await s3.putObject<IMyObject>(ctx.trace.context, MyObject, obj, "some-key", "some-bucket");

            // ... and the same with raw byte arrays
            const buffer = await s3.getObject<Buffer>(ctx.trace.context, "foo", "bucket");
            await s3.putObject<Buffer>(ctx.trace.context, Buffer, obj, "food", "bucket");
        }
    })
    .run();
```

## Configuration

| Name | Description |
|------|-------------|
| endpoint | the HTTP endpoint to connect to |
| accessKeyId | the access key id for authentication |
| secretAccessKey | the secret access key for authentication |
| _encoder_ | the encoder to use when converting the payload to a byte array. this defaults to the `NullMessageEncoder` which only supports Buffers (=byte arrays) being published |
| _typeMapper_ | only required when using `s3Client` and if correct type information needs to be emitted |
| _sslEnabled_ | off by default |
| _apiVersion_ | defaults to "2006-03-01" |
| _defaultBucket_ | specifies the default bucket to store to |
