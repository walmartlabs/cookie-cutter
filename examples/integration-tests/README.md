# Integration Tests

This example demonstrates how to use Cookie Cutter to write end-to-end integration tests for a service.

## How to Run

```
yarn test
```

## Output

```
$ jest --config=../../jest.unit.config.js --rootDir=.
 PASS  src/service.spec.ts
  gRPC endpoint
    ✓ returns new tally (42ms)
  Storage
    ✓ stores correct event (2ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        2.34s
Ran all test suites.
```