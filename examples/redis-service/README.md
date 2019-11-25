# Redis Service Example

This examples demonstrates how to use a Redis Service inside a message handler

## How to Run

```bash
yarn build
yarn start
```

## Output

```
2019-10-10T20:14:32.412Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.2 | serviceName=@examples/redis-service | serviceVersion=0.0.0
2019-10-10T20:14:32.434Z |  INFO | Redis Ready
2019-10-10T20:14:32.436Z |  INFO | onWriteValue | event_type=WriteValue | key=key1 | contents=contents 1
2019-10-10T20:14:32.438Z |  INFO | onWriteValue | event_type=WriteValue | key=key2 | contents=contents 2
2019-10-10T20:14:32.440Z |  INFO | onReadValue | event_type=ReadValue | key=key1 | contents=contents 1
2019-10-10T20:14:32.442Z |  INFO | onReadValue | event_type=ReadValue | key=key2 | contents=contents 2
2019-10-10T20:14:32.531Z |  INFO | shutting down
2019-10-10T20:14:32.534Z |  INFO | Redis End
```
