---
id: module-prometheus
title: Prometheus
---

The Prometheus Module allows Cookie Cutter to expose metrics via HTTP in a Prometheus-scrapeable format.

## Setup

```typescript
Application.create()
    .metrics(prometheus({
        port: 3000,
        endpoint: "/metrics",
        prefix: "",
    }))
    // ...
    .run();
```

## Configuration

| Name       | Description |
|------------|-------------|
| _port_     | port to expose metrics on (default is 3000) |
| _endpoint_ | endpoint to expose metrics on (default is /metrics) |
| _prefix_   | Prefix added to all exposed metrics (default is empty string) |
