---
id: module-statsd
title: StatsD
---

The StatsD Module allows Cookie Cutter to send metrics to any StatsD compatible backend.

## Setup

```typescript
Application.create()
    .metrics(statsd({
        host: "my-statsd-server:port",
    }))
    // ...
    .run();
```

## Configuration

| Name      | Description |
|-----------|-------------|
| host      | the host name + optionally port of the StatsD instance to connect to |
| _prefix_  | a prefix to prepend to all metrics that are emitted |
| _package_ | service name + version, it will default to the values from the root packages package.json file. The service name and version will be emitted as tags for all metrics |
