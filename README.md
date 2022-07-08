# Cookie Cutter

An opinionated framework for building event-driven and request/response based micro services.

| Stable | Beta |
|--------|------|
| [![Build Status](https://github.com/walmartlabs/cookie-cutter/actions/workflows/node.js.yml/badge.svg?branch=master)](https://github.com/walmartlabs/cookie-cutter/actions) | [![Build Status](https://github.com/walmartlabs/cookie-cutter/actions/workflows/node.js.yml/badge.svg?branch=develop)](https://github.com/walmartlabs/cookie-cutter/actions) | 

## Features

* APM (Distributed Tracing with OpenTracing out of the box)
* First Class Support for Event Sourcing
* State Management with automatic Caching
* Extensible and Pluggable
* Can be used for RPC, message based services, and even cron jobs
* Framework for Writing End-to-End Tests

## Getting Started

The documentation is available [here](https://walmartlabs.github.io/cookie-cutter).

## Packages

| Package | Stable | Beta |
|---------|--------|------|
| core | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-core)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-core) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-core/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-core/v/next) |
| amqp | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-amqp)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-amqp) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-amqp/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-amqp/v/next) |
| azure | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-azure)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-azure) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-azure/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-azure/v/next) |
| gcp | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-gcp)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-gcp) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-gcp/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-gcp/v/next) |
| grpc | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-grpc)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-grpc) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-grpc/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-grpc/v/next) |
| instana | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-instana)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-instana) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-instana/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-instana/v/next) |
| jaeger | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-jaeger)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-jaeger) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-jaeger/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-jaeger/v/next) |
| kafka | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-kafka)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-kafka) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-kafka/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-kafka/v/next) |
| kubernetes | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-kubernetes)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-kubernetes) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-kubernetes/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-kubernetes/v/next) |
| lightstep | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-lightstep)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-lightstep) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-lightstep/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-lightstep/v/next) |
| mssql | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-mssql)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-mssql) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-mssql/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-mssql/v/next) |
| prometheus | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-prometheus)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-prometheus) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-prometheus/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-prometheus/v/next) |
| proto | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-proto)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-proto) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-proto/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-proto/v/next) |
| redis | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-redis)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-redis) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-redis/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-redis/v/next) |
| s3 | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-s3)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-s3) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-s3/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-s3/v/next) |
| statsd | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-statsd)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-statsd) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-statsd/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-statsd/v/next) |
| timer | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-timer)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-timer) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-timer/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-timer/v/next) |
| validatejs | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-validatejs)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-validatejs) | [![npm version](https://badgen.net/npm/v/@walmartlabs/cookie-cutter-validatejs/next)](https://www.npmjs.com/package/@walmartlabs/cookie-cutter-validatejs/v/next) |

# License

See [LICENSE](LICENSE.md) and [LICENSE-DOCS](LICENSE-DOCS) for more details.
