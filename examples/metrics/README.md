# Metrics

This example demonstrates built-in and custom metrics with Cookie Cutter. It implements a custom metrics provider that will turn all metrics into log messages for easy visibility. A real-world application would use a metrics provider for a backend like Prometheus.

## How to Run

```bash
yarn start
```

## Output

```
2019-09-12T16:50:44.707Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.0 | serviceName=@examples/metrics | serviceVersion=0.0.0
2019-09-12T16:50:44.717Z |  INFO | #METRIC -- increment | key=cookie_cutter.core.received | value=1 | event_type=Foo
2019-09-12T16:50:44.718Z |  INFO | hello | event_type=Foo
2019-09-12T16:50:44.718Z |  INFO | #METRIC -- gauge | key=text_length | value=5
2019-09-12T16:50:44.720Z |  INFO | #METRIC -- increment | key=cookie_cutter.core.received | value=1 | event_type=Bar
2019-09-12T16:50:44.720Z |  WARN | world | event_type=Bar
2019-09-12T16:50:44.720Z |  INFO | #METRIC -- gauge | key=text_length | value=5
2019-09-12T16:50:44.770Z |  INFO | #METRIC -- gauge | key=cookie_cutter.core.output_batch | value=2
2019-09-12T16:50:44.773Z |  INFO | #METRIC -- increment | key=cookie_cutter.core.processed | value=1 | result=success | event_type=Foo
2019-09-12T16:50:44.773Z |  INFO | #METRIC -- increment | key=cookie_cutter.core.processed | value=1 | result=success | event_type=Bar
2019-09-12T16:50:44.826Z |  INFO | shutting down
```