---
id: comp-state
title: State
---

## Reading State

A service can access state from any message handler function via the dispatch context's `state` property. The `get` method reads in the state for a specified key from the underlying storage system. Whether the state is an aggregate of an underlying event stream or a direct representation of a row in a database is transparent to the message handler at this point, it will always receive an instance of the domain model representation of the state.

```typescript
async function onMyInput(msg: IMyInput, ctx: IDispatchContext<MyState>): Promise<void> {
    const stateRef = await ctx.state.get("customer-18483");
    ctx.logger.info("loaded state", {
        key: stateRef.key,
        seqNum: stateRef.seqNum,
        isNew: stateRef.isNew,
        state: JSON.stringify(stateRef.state),
    });
}
```

However, the `get` method does not only return the state object itself, but wraps it in a `StateRef` which contains the state's identity (key + sequence number) as well. A `StateRef` is used as a token for optimistic concurrency, the sink will use it to make sure it only persists new state if the old one hasn't changed in the mean time.

## State Domain Model

You are free to design the domain model of the state in any shape or form that suites your service. There is only one convention the state needs to adhere to: it must have a constructor that accepts a snapshot and it must have a method called `snap` that returns a snapshot. The idea is that these two operations can be combined to fulfill `expect(new MyState(state.snap())).toMatchObject(state)`, meaning the framework can use a combination of the `snap` function and the constructor to create a deep copy of the state. This also means that `snap` should return a snapshot that in fact is a deep copy and not a shallow copy of state internals. It is also a good practice to only use data types for the snapshot that can be serialized nicely as the snapshot may get serialized and persisted if for instance snapshotting is enabled for event sourced states.

```typescript
interface IMyStateSnapshot {
    readonly name: string;
    readonly tags: string[];
}

class MyState {
    public name: string;
    private tags: Set<string>;

    constructor(snapshot?: IMyStateSnapshot) {
        if (snapshot) {
            this.name = snapshot.name;
            this.tags = new Set(snapshot.tags);
        } else {
            this.name = "default";
            this.tags = new Set();
        }
    }

    public snap(): IMyStateSnapshot {
        return {
            name: this.name,
            tags: Array.from(this.tags.values),
        };
    }

    public hasTag(tag: string): boolean {
        return this.tags.has(tag);
    }

    public addTag(tag: string): void {
        this.tags.add(tag);
    }
}
```

## State Aggregation (Event Sourcing)

If the state is event sourced you will need to implement an aggregator in addition to the state domain model. The aggregator is responsible for applying the individual events from the state's event stream to the aggregated domain model. Assuming the event stream consists of `NameChanged` and `TagsAdded` events then an aggregator class for `MyState` could look like this.

```typescript
class MyStateAggregator {
    public onNameChanged(msg: INameChanged, state: MyState): void {
        state.name = msg.name;
    }

    public onTagsAdded(msg: ITagsAdded, state: MyState): void {
        for (const tag of msg.tags) {
            state.addTag(tag);
        }
    }
}
```

State Aggregators are structurally very similar to message handlers. They follow the same naming convention for function names and receive the event to process as the first argument. The second argument is the state the event should be applied to - this will be same instance throughout the aggregation process. The aggregator class itself should be stateless as it will be reused for all states it aggregates.

Also one important distinction between message handlers and state aggregators: aggregators *must not* be asynchronous.

## State Providers

State providers are what powers the `ctx.state.get` function available in message handlers. Their responsibility is to read the state's raw data from an underlying storage system and transform it into the state domain model the service uses. State providers are not responsible for storing state, however.

```typescript
export interface IStateProvider<TState> {
    get(spanContext: SpanContext, key: string, atSn?: number): Promise<StateRef<TState>>;
    compute(stateRef: StateRef<TState>, events: IMessage[]): StateRef<TState>;
}
```

Each state provider implements a `get` and a `compute` operation. `get` matches the `ctx.state.get` function from the message handler (the `SpanContext` in the interface's function is supplied automatically by the framework). The `atSn` argument is optional and may or may not be supported depending on the state provider. Event sourced state providers should generally support retrieving the state as of a specified sequence number whereas state providers for materialized views might not be able to load state at a certain point in time and will always return the latest state.

`compute` is used to derive a new state in-memory based on an existing state and additional events that should be applied on top of that. For an event sourced state provider the behavior is rather obvious (it applies the `events` on top of `stateRef` using the state aggregator class). Materialized views work by calling `ctx.store` with the new version of the state's snapshot, so in that case `compute` would just take the last item from `events` and return it as a new `StateRef`.

From the message handler you can use `compute` with a simplified API

```typescript
export interface IDispatchState<TState> {
    get(key: string, atSn?: number): Promise<StateRef<TState>>;
    compute(): Array<StateRef<TState>>;
    compute(key: string): StateRef<TState> | undefined;
}
```

`compute` without any arguments will return a list of all states that are changed via `ctx.store` calls and `compute(key)` will return just one state for the specified key (or `undefined` if the state hasn't been changed).

## Updating State

State is updated in the underlying persistence layer via an output sink. Usually you will configure a matching pair of state provider and output sink. 

```typescript
Application.create()
    .state(myEventSourcedStateProvider)
    .dispatch({
        onInput: async (msg: IInput, ctx: IDispatchContext<MyState>): Promise<void> {
            const stateRef = ctx.state.get(msg.id);
            ctx.store(NewEvent, stateRef, { /* some payload */ });
        }
    })
    .output()
        .stored(myEventSourcedStateSink)
        .done()
    .run();
```

The output sink will receive all messages that were `store`_d_ by message handler and try to write them to the underlying persistence mechanism with optimistic concurrency (`stateRef` serves as the optimistic concurrency token in this case). In case of a failure due to optimistic concurrency the message handler will be invoked again until it finally succeeds.

## State Cache

For a lot of applications it makes sense to cache state in-memory to avoid incurring the cost of read I/O for every single state transition. Cookie Cutter provides a generic state caching mechanism that works with any state provider. It can be enabled like this

```typescript
Application.create()
    .state(cached(
        MyState,
        myEventSourcedStateProvider(
            MyState,
            new MyStateAggregator(),
        )
    ))
```

It's a decorator function around the underlying state provider. By default it will keep a LRU cache of the last 1,000 states by key. The states in the cache will automatically be updated after each message handler execution using the `compute` function described above. This means that even if the state changes over time it can still be served from the cache and we only have to perform I/O to retrieve the initial state that the service then can build upon.

The invalidation strategy for this cache is optimistic concurrency. The framework will consider the cached state up-to-date until it encounters an optimistic concurrency failure at which point it invalidates that cache entry and fetches the latest state from the underlying state provider during the retry loop.