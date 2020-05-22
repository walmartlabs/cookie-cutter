# Azure Queue Example

This example demonstrates how to use an azure queue source and sink.

## How to Run

```bash
yarn build
yarn start
```

## Output

```
2019-09-25T13:45:02.074Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.1 | serviceName=@examples/azure-queue | serviceVersion=0.0.0
2019-09-25T13:45:03.418Z |  INFO | onRegualarSizeMessage | queue.visibility_timeout=Wed, 25 Sep 2019 13:45:33 GMT | queue.dequeue_count=1 | id=2019-09-25T13:45:03.296Z
2019-09-25T13:45:04.050Z |  INFO | onLargeSizeMessage | queue.visibility_timeout=Wed, 25 Sep 2019 13:45:33 GMT | queue.dequeue_count=1 | id=2019-09-25T13:45:03.296Z | hasPayload=200
2019-09-25T13:45:33.918Z |  INFO | onRegualarSizeMessage | queue.visibility_timeout=Wed, 25 Sep 2019 13:46:03 GMT | queue.dequeue_count=1 | id=2019-09-25T13:45:33.790Z
2019-09-25T13:45:34.396Z |  INFO | onLargeSizeMessage | queue.visibility_timeout=Wed, 25 Sep 2019 13:46:04 GMT | queue.dequeue_count=1 | id=2019-09-25T13:45:33.790Z | hasPayload=200
```
