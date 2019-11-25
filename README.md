# Cookie Cutter

![Alt text](/docs/website/static/img/favicon.png?raw=true "Logo")

Cookie Cutter is an opinionated framework for building event-driven micro services. Its main goal is to allow developers to focus on the domain problem and abstract away cross-cutting concerns like APM, logging, caching, state management, etc ...

key design goals are

1. clear separation of concerns: don't get your domain code intermingled with your infrastructure code - no need to mock a Kafka consumer or for testing your domain logic

2. reduction of boiler-plate code: don't waste time writing code for bootstrapping, error handling, graceful shutdown, forceful shutdown, configuration management, ... let the framework take care of it.

3. similarity of services: if you know your way around one service implemented with Cookie Cutter you will easily understand any other Cookie Cutter based service

4. extensible / pluggable: connect to any message bus, use any opentracing-compliant APM, use your favorite logger, ...

5. first-class support for event sourcing state management / aggregation built in as well as optimistic concurrency and support for exactly-once-semantics

6. RPC + batch jobs RPC services and batch jobs don't have to be design-snowflakes in a message-driven architecture, use the same framework to build them
