# Kafka Events

This example demonstrates how to subscribe to an event stream from Kafka and handle each message by its type with a dedicate handler function.

## How to Run

Before running this example, please adjust the code to include your Kafka connection details.

```bash
yarn start:publisher
```

then

```bash
yarn start:consumer
```

## Output (consumer)

```
2019-09-12T17:01:39.459Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.0 | serviceName=@examples/kafka-events | serviceVersion=0.0.0
{"level":"INFO","timestamp":"2019-09-12T17:01:39.501Z","logger":"kafkajs","message":"[Consumer] Starting","groupId":"test-group-1"}
{"level":"INFO","timestamp":"2019-09-12T17:01:40.691Z","logger":"kafkajs","message":"[Runner] Consumer has joined the group","groupId":"test-group-1","memberId":"test-group-1-7493ec26-033d-4771-84f5-5860f9ffa9f5-2ff2a54a-f6c1-40e9-a198-abb7828695d8","leaderId":"test-group-1-7493ec26-033d-4771-84f5-5860f9ffa9f5-2ff2a54a-f6c1-40e9-a198-abb7828695d8","isLeader":true,"memberAssignment":{"test-topic":[0]},"groupProtocol":"RoundRobinAssigner","duration":1189}
2019-09-12T17:01:40.802Z |  INFO | user jdoe registered | event_type=CustomerRegistered | topic=test-topic | offset=0 | partition=0 | key=jdoe | timestamp=Thu Sep 12 2019 13:01:29 GMT-0400 (EDT) | consumerGroupId=test-group-1
2019-09-12T17:01:40.804Z |  INFO | user jdoe placed an order | event_type=OrderPlaced | topic=test-topic | offset=1 | partition=0 | key=jdoe | timestamp=Thu Sep 12 2019 13:01:29 GMT-0400 (EDT) | consumerGroupId=test-group-1
^C2019-09-12T17:01:45.713Z |  INFO | shutdown requested
2019-09-12T17:01:45.714Z |  INFO | shutting down
```