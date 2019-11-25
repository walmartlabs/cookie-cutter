---
id: intro-getting-started
title: Getting Started
---

## Introduction

Cookie Cutter is an opinionated framework for building event-driven micro services. Its main goal is to allow developers to focus on the domain problem and abstract away cross-cutting concerns like APM, logging, caching, state management, etc ...

key design goals are

1. **clear separation of concerns**:
   don't get your domain code intermingled with your infrastructure code - no need to mock a Kafka consumer to test your domain logic

2. **reduction of boiler-plate code**:
   don't waste time writing code for bootstrapping, error handling, graceful shutdown, forceful shutdown, configuration management, ... let the framework take care of it.

3. **similarity of services**:
   if you know your way around one service implemented with Cookie Cutter you will easily understand any other Cookie Cutter based service

4. **extensible / pluggable**:
   connect to any message bus, use any opentracing-compliant APM, use your favorite logger, ...

5. **first-class support for event sourcing**:
   state management / aggregation built in as well as optimistic concurrency and support for exactly-once-semantics

6. **RPC + batch jobs**:
   RPC services and batch jobs don't have to be design-snowflakes in a message-driven architecture, use the same framework to build them

The core framework provides abstractions for input sources, message processing strategies, output sinks and a declarative way to glue these pieces together. A key concept is that all pieces of the framework are pluggable and can easily be substituted for specialized use cases.

## High Level Design

From a high level point of view every Cookie Cutter service consists of a few disjoint pieces

1. **input**: defines a source of inputs to process as a finite or infinite stream of messages. Each message has a type and a payload. Messages can originate from different sources, e.g. Kafka.
2. **dispatch**: an object containing handler functions for individual incoming messages from input sources.
3. **output**: defines a sink for the outputs produced by the message handlers, this could be saving a record to a database or publishing a message using a message broker like Kafka.
4. **setup**: descriptive definition of the service that connects input, handlers and output

Below is a fictitious example of the *setup* of a service that sends text message notifications to customers once their orders ship. The event that is driving this business process arrives from Kafka, is handled in the `onOrderFulfilled` handler and sends out its output thru a text message gateway service. We can also see that the service is sending out metrics via StatsD and is using Jaeger for distributed tracing - our code doesn't explicitly emit metrics or traces; the framework will do that under the covers automatically.

```typescript
const handler = {
    onOrderFulfilled(msg: IOrderFulfilled, ctx: IDispatchContext): void {
        if (msg.customer.phoneNumber !== undefined) {
            ctx.logger.info("notifying customer");
            ctx.publish(TextMessage, {
                number: msg.customer.phoneNumber,
                msg: "your order was shipped",
            });
        }
    }
};

Application.create()
    .logger(new ConsoleLogger())
    .metrics(statsd(/* config */))
    .tracing(jaeger(/* config */))
    .input()
        .add(kafka(/* config */))
        .done()
    .dispatch(handler)
    .output()
        .published(textMessageGateway(/* config */))
        .done()
    .run();
```

We can now easily test the entire service end-to-end with the built-in helper function `runIntegrationTest`. The clear separation between input, processing and output allows the `runIntegrationTest` function to seamlessly replace the Kafka input with a static list of input messages supplied by the test case and to capture the outputs on the other end and return them back to the test case for assertions.

This approach allows us to treat each micro service as a black box that takes inputs and produces outputs. Therefore, test cases can focus on the expected behavior of a service as it can be seen by an outside observer and don't necessarily need to test implementation details (like individual classes / functions). This promotes frequent code redesign and refactoring as test cases generally remain valid without changing a single line of code.

```typescript
describe("My Application", () => {
    it("notifies customers", async () => {
        const app = Application.create().dispatch(handler);
        const result = await runIntegrationTest(app, [
            msg(OrderFulfilled, { customer: { phoneNumber: "123-456-7890" } })
        ]);

        expect(result.published).toHaveLength(1);
        expect(result.published[0]).toMatchObject({
            number: "123-456-7890",
            msg: "your order was shipped"
        });
    })
})
```
