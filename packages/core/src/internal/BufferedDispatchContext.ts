/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { MetadataLoggerDecorator } from "../internal";
import {
    IClassType,
    IDispatchContext,
    IDispatchState,
    ILogger,
    IMessageEnricher,
    IMessageTypeMapper,
    IMetrics,
    IPublishedMessage,
    IServiceRegistry,
    IStateCacheLifecycle,
    IStateProvider,
    IStoredMessage,
    ITracing,
    MessageRef,
    StateRef,
} from "../model";
import { iterate, RetrierContext } from "../utils";
import { BufferedMetrics } from "./BufferedMetrics";

class DispatchState<TState> implements IDispatchState<TState> {
    private readonly _loaded: Map<string, StateRef> = new Map();

    constructor(
        private readonly stateProvider: IStateProvider<TState>,
        private readonly trace: ITracing,
        private readonly storedItems: IStoredMessage[]
    ) {}

    public async get(key: string, atSn?: number): Promise<StateRef<TState>> {
        const stateRef = await this.stateProvider.get(this.trace.context, key, atSn);
        this._loaded.set(stateRef.key, stateRef);
        return stateRef;
    }

    public get loaded(): StateRef[] {
        return Array.from(this._loaded.values());
    }

    public clear(): void {
        this._loaded.clear();
    }

    public compute(): StateRef<TState>[];
    public compute(key: string): StateRef<TState>;
    public compute(key?: any) {
        if (key) {
            const matches = this.storedItems.filter((i) => i.state.key === key);
            if (matches.length === 0) {
                return undefined;
            }
            return this.stateProvider.compute(
                matches[0].state,
                matches.map((m) => m.message)
            );
        }

        const states = Array<StateRef<TState>>();
        const keys = new Set(this.storedItems.map((i) => i.state.key));
        for (const key of keys) {
            const matches = this.storedItems.filter((i) => i.state.key === key);
            const newState = this.stateProvider.compute(
                matches[0].state,
                matches.map((m) => m.message)
            );
            states.push(newState);
        }
        return states;
    }
}

export class BufferedDispatchContext<TState = any> implements IDispatchContext<TState> {
    private readonly publishedItems: IPublishedMessage[];
    private readonly storedItems: IStoredMessage[];
    private readonly _state: DispatchState<TState>;
    public handlerResult: { value?: any; error?: Error };
    public readonly logger: ILogger;
    public readonly metrics: BufferedMetrics;
    private _completed: boolean = false;
    public retry: RetrierContext;

    constructor(
        public readonly source: MessageRef,
        metricsPublisher: IMetrics,
        logger: ILogger,
        private readonly stateProvider: IStateProvider<TState>,
        public readonly trace: ITracing,
        private readonly enricher: IMessageEnricher,
        private readonly mapper: IMessageTypeMapper,
        public readonly services: IServiceRegistry
    ) {
        this.publishedItems = [];
        this.storedItems = [];
        this.handlerResult = {};
        this.logger = new MetadataLoggerDecorator(logger, this.source.getAllMetadata());
        this.metrics = new BufferedMetrics(metricsPublisher);
        this._state = new DispatchState(this.stateProvider, this.trace, this.storedItems);
        this.retry = undefined;
    }

    /**
     * @deprecated Deprecated.
     *
     * @param {any} err
     * @returns never
     */
    public bail(err: any): never {
        this.retry.bail(err);
        throw err;
    }

    public get state(): IDispatchState<TState> {
        return this._state;
    }

    public get loadedStates(): StateRef[] {
        return this._state.loaded;
    }

    public metadata<T, M extends string>(key: M): T {
        return this.source.metadata<T>(key);
    }

    public publish<T, M extends string = string>(
        type: IClassType<T>,
        msg: T,
        meta?: Readonly<{ [key in M]: any }>
    ): void {
        if (this.completed) {
            throw new Error(
                "Buffered Dispatch Context was already completed. Unable to call publish after completion."
            );
        }
        if (!meta) {
            meta = {} as any;
        }
        const message = {
            type: this.mapper.map(type),
            payload: msg,
        };
        this.enricher.enrich(message, this.source);
        this.publishedItems.push({
            message,
            metadata: meta,
            original: this.source,
            spanContext: this.trace.context,
        });
    }

    public store<T, M extends string = string>(
        type: IClassType<T>,
        state: StateRef<TState>,
        msg: T,
        meta?: Readonly<{ [key in M]: any }>
    ): void {
        if (this.completed) {
            throw new Error(
                "Buffered Dispatch Context was already completed. Unable to call store after completion."
            );
        }
        const message = {
            type: this.mapper.map(type),
            payload: msg,
        };
        this.enricher.enrich(message, this.source);
        this.storedItems.push({
            state,
            message,
            metadata: meta,
            original: this.source,
            spanContext: this.trace.context,
        });
    }

    public get published(): IterableIterator<IPublishedMessage> {
        return iterate(this.publishedItems);
    }

    public get stored(): IterableIterator<IStoredMessage> {
        return iterate(this.storedItems);
    }

    public typeName<T>(type: IClassType<T>): string {
        return this.mapper.map(type);
    }

    public complete(): void {
        if (this.isStateCacheLifecycle(this.stateProvider)) {
            for (const state of this.state.compute()) {
                this.stateProvider.set(state);
            }
        }
        this.metrics.flush();
        this._completed = true;
    }

    public get completed(): boolean {
        return this._completed;
    }

    public clear(): void {
        this.publishedItems.length = 0;
        this.storedItems.length = 0;
        this.metrics.clear();
        this._state.clear();
    }

    private isStateCacheLifecycle(obj: any): obj is IStateCacheLifecycle<TState> {
        return obj.invalidate !== undefined && obj.set !== undefined;
    }
}
