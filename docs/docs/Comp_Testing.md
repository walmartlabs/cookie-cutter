---
id: comp-testing
title: Testing
---

## Introduction

Cookie Cutter ships with a mechanism to easily write end-to-end integration tests. Test cases are stated in the form of inputs that are expected to produce certain outputs. This is a rather high-level approach to testing that views the service itself as a black box and only verifies that it adheres to its contracts from an outside observer's perspective. The advantage of this approach is that test suites remain valid and do not need any changes even if the internals of a service are redesigned or rewritten. However, more granular unit tests can be used in conjunction with this approach.

The example below shows a simple service that emits one output message for every input and the corresponding integration test for it.

```typescript
// ---------- ACTUAL APPLICATION ----------
class MessageHandler {
    public onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
        ctx.publish(Output, { value: msg.id + 1 });
    }
}

Application.create()
    .input()
        .add(/* some input source */)
        .done()
    .dispatch(new MessageHandler())
    .output()
        .published(/* some output sink */)
        .done()
    .run();


// ---------- INTEGRATION TESTS ----------
function createTestApp(): IApplicationBuilder {
    return Application.create()
        .dispatch(new MessageHandler());
}

describe("My Application", () => {
    it("produces Outputs with correct value", async () => {
        const result = await runIntegrationTest(createTestApp(), [
            msg(MyInput, { id: 7 }),
            msg(MyInput, { id: 12 }),
        ]);

        expect(result.outputs).toMatchObject([
            msg(Output, { value: 8 }),
            msg(Output, { value: 13 }),
        ]);
    });
});
```

An integration test is very similar to the actual application setup. The only difference is that the test application has no inputs and no outputs defined and we do not call the `run` method directly. When the test application is passed to `runIntegrationTest` it will add a mock input source and mock output sinks before running that application. The test application should be configured as similar as possible to the application defined for the actual service, meaning it should use the same message handler setup, validation, type mapper, etc ... Only things that would cause any kind of external communication (tracing, metrics, sources, sinks ...) should either be left out or need to be mocked.

## Test Result

`runIntegrationTest` returns the following data

```typescript
export interface ITestResult {
    readonly published: IPublishedMessage[];
    readonly stored: IStoredMessage[];
    readonly outputs: IMessage[];
    readonly responses: any[];
}
```

* *published* contains all messages that were published from message handlers with additional context
* *stored* contains all messages that were published from message handlers with additional context
* *outputs* contains the inner messages from stored and published (first all stored messages, then the published ones)
* *responses* contains the return values from each message handler, this is only useful for RPC handlers

## Mocking State (Event Sourced)

Event Sourced state can be mocked with the `mockState` helper functions. It accepts one parameter that contains events per event-stream.

```typescript
function createTestApp(): IApplicationBuilder {
    return Application.create()
        .dispatch(new MessageHandler())
        .state(mockState({
            ["customer-1"]: [
                msg(CustomerRegistered, { id: 1, name: "John Doe" }),
                msg(CustomerEmailChanged, { email: "john@doe.com" }),
            ]
        }));
}
```

## Mocking State (Materialized)

Materialized views can be mocked with `mockMaterializedState` helper function:

```typescript
function createTestApp(): IApplicationBuilder {
    return Application.create()
        .dispatch(new MessageHandler())
        .state(mockMaterializedState(Customer, {
            "customer-1": new Customer({name: "John Doe"}),
            "customer-2": new Customer({name: "Jane Doe"})
        }));
}
```

## Truncating Outputs

Sometimes it can be useful not to record all published or stored messages, but only some of them. An example might be multiple input messages that are required to setup the correct state on which the last input message is then supposed to act upon. This can be done with a special input message called the truncate beacon.

```typescript
describe("My Application", () => {
    it("produces Outputs with correct value", async () => {
        const result = await runIntegrationTest(createTestApp(), [
            msg(UserCreated, { name: "john" }),
            msg(UserCreated, { name: "jane" }),
            truncateOutputBeacon(), // forget all the outputs up to this point
            msg(FriendRequestSent, { from: "john", to: "jane" }),
        ]);

        expect(result.outputs).toMatchObject([
            msg(FriendRequestAccepted, { ... }),
        ]);
    });
});
```

## Defining Metadata

The `msg` helper function can be used to create instances of `IMessage` or `MessageRef` that are expected by `runIntegrationTest`. It will implicitly use the `ObjectNameMessageTypeMapper` to generate the message's typename. If a 3rd parameter is passed to `msg` it will return a `MessageRef` instead of an `IMessage` that contains additional metadata. Generally this is only required if you have message handlers that operate on this metadata.

```typescript
class MessageHandler {
    public onMyInput(msg: IMyInput, ctx: IDispatchContext): void {
        ctx.publish(MyInput, msg, {
            [KafkaMetadata.Key]: ctx.metadata<string>(KafkaMetadata.Key),
        });
    }
}

describe("My Application", () => {
    it("publishes with same key it received", async () => {
        const result = await runIntegrationTest(createTestApp(), [
            msg(MyInput, { id: 7 }, { [KafkaMetadata.Key]: "abc" }),
        ]);

        expect(result.published).toMatchObject([
            { metadata: { [KafkaMetadata.Key]: "abc" } },
        ]);
    });
});
```
