# AMQP Messages

This example demonstrates how to produce and consume messages from a specified queue in an AMQP Broker (RabbitMQ).

## How to Run

Before running this example, please adjust the code to include your AMQP Broker (RabbitMQ) connection details.

```bash
yarn start:producer
```

then

```bash
yarn start:consumer
```

## Output (consumer)

```
2020-06-30T21:40:09.956Z |  INFO | starting Cookie Cutter service | version=1.3.0-beta.5 | serviceName=@examples/amqp-messages | serviceVersion=0.0.0
2020-06-30T21:40:10.002Z |  INFO | Source | amqp.queue_name=defaultQueueName | payload=Message #1
2020-06-30T21:40:10.004Z |  INFO | Source | amqp.queue_name=defaultQueueName | payload=Message #2
```