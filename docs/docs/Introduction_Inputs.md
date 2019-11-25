---
id: intro-inputs
title: Inputs
---

## Messages

All inputs into a Cookie Cutter based service are modeled as message streams. Each message must have a `type` and a `payload` and may optionally carry additional `metadata` in the form of key/value pairs and an associated `SpanContext` for tracing purposes.

```typescript
export interface IMessage {
    readonly type: string;
    readonly payload: any;
}

export declare class MessageRef {
    readonly payload: IMessage;
    readonly spanContext: SpanContext;
    constructor(meta: IMetadata, payload: IMessage, spanContext?: SpanContext);
    metadata<T>(key: string): T;
    release(value?: any, error?: Error): Promise<void>;
    // ...
}
```

## Input Sources

In order to connect a Cookie Cutter service to an external message source like a Kafka broker it requires an implementation of the `IInputSource` interface. Cookie Cutter ships with many input source types out of the box, however it can sometimes be useful to implement custom input sources for specialized use cases. 

```typescript
export interface IInputSource {
    start(): AsyncIterableIterator<MessageRef>;
    stop(): Promise<void>;
}
```

The framework will invoke the `start` method to create an asynchronous iterator that will transport the incoming messages from the input source into the framework's internals. When the application is requested to shutdown (e.g. on CTRL+C or a signal was sent to the process) it will call the `stop` method which is expected to complete the iterator previously returned by `start`.

## Finite vs. Infinite Streams

Input sources may create iterators that are either finite or infinite. Infinite streams make a lot of sense when interacting with message broker systems and are the predominate use case for input sources, however finite streams can be very useful for creating service that run batch jobs or on a schedule.

The lifecycle of a Cookie Cutter application is determined by its input source(s). It will try to process all messages as they flow in unless the application is requested to shutdown. This behavior can be used to create batch jobs with custom input sources where the input sources queries all the data that needs to be processed in the current batch and yields each item one at a time. Once all messages are processed the application will terminate. In the case of infinite iterators the application will never terminate and keep processing messages as they flow in.

## Multiple Inputs

You may add more than one input source to a Cookie Cutter application. The framework will process the sources in a round-robin fashion as messages are available; if some of the sources only generate message sporadically it will keep processing messages from sources that have messages available to prevent the round-robin logic from stalling the application. Keep in mind though: there are no ordering guarantees for messages originating from different sources.

## Example Input Source

```typescript 
export class ExampleInputSource implements IInputSource {
    private readonly done: boolean = false;

    public async *start(): AsyncIterableIterator<MessageRef> {
        for (let i = 0; i < 10000; i++) {
            // ensure that the iterator completes
            // when stop is called
            if (this.done) {
                break;
            }

            const span = globalTracer().startSpan("example");
            const data: IMessage = {
                type: "Example",
                payload: { value: i }
            };
            const msg = new MessageRef(
                {
                    // some additional metadata
                    // associated with this message
                    ["eventTime"]: new Date().toISOString(),
                },
                // the payload of the message that will be
                // passed to the message handler
                data,
                // the root trace for APM
                span.context(), 
            )
            msg.once("released", () => {
                span.finish();
            });

            yield msg;
            await sleep(100);
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
    }
}

Application.create()
    .logger(new ConsoleLogger())
    .input()
        .add(new ExampleInputSource())
        .done()
    .dispatch({
        onExample(msg: any, ctx: IDispatchContext): void {
            ctx.logger.info(`'${msg.value}' generated at ... ${ctx.metadata<string>("eventTime")}`);
        }
    })
    .run();
```

```bash
1 generated at ... 2019-05-01T18:02:28.502Z
2 generated at ... 2019-05-01T18:02:28.602Z
3 generated at ... 2019-05-01T18:02:28.702Z
>>> CTRL+C
```
