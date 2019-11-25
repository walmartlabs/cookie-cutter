---
id: module-protobuf
title: Protobuf
---

The Protobuf module contains encoders and type mappers to deal with protobuf encoded messages. Currently it only supports `protobufjs` with static modules and not Google's official protobuf package.

## Generating Code from Protos

```bash
pbjs -t static-module -w commonjs -o bundle.js file1.proto, file2.proto, ...
pbts -o bundle.d.ts bundle.js
```

This will generate JavaScript encoders and decoders for all messages defined in the proto files as well as TypeScript interfaces and class declarations for those.

## Using Protos

Once the bundle files are generated they can be used to

1. Create a registry that contains mappings from encoder names to encoder classes and vice versa
2. Create the corresponding `ProtoMessageEncoder` and `ProtoMessageTypeMapper` instances
3. Use the types from the bundle when handling messages in handler functions

```typescript
import * as proto from "bundle";
let registry = pbjsStaticModuleRegistry(require("./bundle"));

Application.create()
    .input()
        .add(someSource({
            // ... config
            encoder: new ProtoMessageEncoder(registry),
        }))
        .done()
    .typeMapper(new ProtoMessageTypeMapper(registry))
    .dispatch({
        onProtoMessageA: (msg: proto.IProtoMessageA, ctx: IDispatchContext) => {
            ctx.publish(proto.ProtoMessageB, { /* payload */ });
        }
    })
    .output()
        .published(someSink({
            // ... config
            encoder: new ProtoMessageEncoder(registry),
        }))
        .done()
    .run();
```
