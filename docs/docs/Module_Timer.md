---
id: module-timer
title: Timer
---

Cookie Cutter's Timer module allows a service to perform an operation on an interval

## Example

```typescript
Application.create()
    .input()
        .add(intervalSource({
            // trigger the first msg after 1 sec (this setting is optional)
            firstTimeout: 1000,
            // trigger all subsequent msg every 30 sec
            timeout: 30000,
        }))
        .done()
    .dispatch({
        onInterval: (msg: IInterval, ctx: IDispatchContext) => {
            ctx.logger.info(msg.eventTime);
        }
    })
    .run();
```

## Dynamic Intervals

The message handler may overwrite the next time it wants to be invoked again. This can be useful if the next interval can be computed from the previous one.

```typescript
Application.create()
    .input()
        .add(intervalSource({
            // trigger every 30 sec
            timeout: 30000,
        }))
        .done()
    .dispatch({
        onInterval: (msg: IInterval, ctx: IDispatchContext) => {
            // next interval should fire in 1.5 sec
            msg.overrideNextTimeout(1500);
        }
    })
    .run();
```

## Testing Intervals

The `mockIntervalMsg` can be used to trigger intervals in integration tests.

```typescript
function createTestApp(): IApplicationBuilder {
    Application.create()
        .dispatch({
            onInterval: (msg: IInterval, ctx: IDispatchContext) => {
                ctx.publish(Output, { ... });
            }
        })
}

describe("My Application", () => {
    it("sends a message on an interval", async () => {
        const result = await runIntegrationTest(createTestApp(), [
            mockIntervalMsg(),
        ];

        expect(result.published).toHaveLength(1);
    });
});
```