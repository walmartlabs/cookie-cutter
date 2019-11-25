---
id: comp-logging
title: Logging
---

Cookie Cutter comes with its own logging abstraction that is used throughout the framework and recommended to be used by services built with Cookie Cutter as well.

```typescript
export interface ILoggerStructuredData {
    [key: string]: any;
}

export interface ILogger {
    info(message: string, data?: ILoggerStructuredData): void;
    debug(message: string, data?: ILoggerStructuredData): void;
    warn(message: string, data?: ILoggerStructuredData): void;
    error(message: string, err?: any, data?: ILoggerStructuredData): void;
}
```

The core framework ships with a `NullLogger` (the default, that will not print any logs) and a `ConsoleLogger` that will write all log messages to `stdout`.

```typescript
Application.create()
    .logger(new ConsoleLogger())
    // ...
    .run();
```

Message Handlers can gain access to the logger via the `DispatchContext`

```typescript
function onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
    ctx.logger.info("processing a message", {
        customerId: msg.customerId,
    });
}
```

In combination with the `ConsoleLogger` the snipped above would print the following to `stdout`

```bash
2019-05-16T15:57:05.284Z |  INFO | processing a message | customerId=4123
2019-05-16T15:57:07.214Z |  INFO | processing a message | customerId=2641
```

Log messages emitted in the context of a message handler will automatically add all metadata of the input message as structured log data.

```typescript
function onMyKafkaInput(msg: IMyKafkaInput, ctx: IDispatchContext): void {
    ctx.logger.info("processing a message from Kafka", {
        customerId: msg.customerId,
    });
}
```

```bash
2019-05-16T15:57:05.284Z |  INFO | processing a message from Kafka | customerId=4123 | topic=my-topic | partition=1 | offset=273471
```

The log level can be configured during application setup

```typescript
Application.create()
    .logger(new ConsoleLogger(), LogLevel.Warning)
    // ...
    .run();
```

This will only print log messages that are `Warning` or higher. The default log level is `Debug`.