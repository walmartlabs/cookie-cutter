/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { SpanContext } from "opentracing";
import { IClassType } from "./dispatch";
import { StateRef } from "./state";

export type ReleaseCallbackFn = (msg: MessageRef, value?: any, error?: Error) => Promise<void>;

export interface IMetadata {
    readonly [key: string]: any;
}

export class MessageRef {
    private readonly listeners: ReleaseCallbackFn[];
    private evicted: boolean = false;

    constructor(
        private meta: IMetadata,
        public readonly payload: IMessage,
        public readonly spanContext: SpanContext = null
    ) {
        this.listeners = [];
    }

    public once(_: "released", cb: ReleaseCallbackFn) {
        this.listeners.push(cb);
    }

    public metadata<U>(key: string): U {
        return this.meta[key] as U;
    }

    public async release(value?: any, error?: Error): Promise<void> {
        for (const item of this.listeners) {
            await item(this, value, error);
        }
        this.listeners.length = 0;
    }

    public addMetadata(meta: IMetadata): void {
        this.meta = {
            ...this.meta,
            ...meta,
        };
    }

    public getAllMetadata(): IMetadata {
        return this.meta;
    }

    public evict() {
        this.evicted = true;
    }

    public get isEvicted(): boolean {
        return this.evicted;
    }
}

export enum EventProcessingMetadata {
    Sequence = "sys.sequence",
    ReprocessingContext = "sys.reprocessingContext",
}

export enum EventSourcedMetadata {
    SequenceNumber = "sn",
    Stream = "stream_id",
    EventType = "event_type",
    Timestamp = "dt",
}

export interface IMessage {
    readonly type: string;
    readonly payload: any;
}

export interface IPublishedMessage {
    readonly message: IMessage;
    readonly metadata: IMetadata;
    readonly original: MessageRef;
    readonly spanContext: SpanContext;
}

export interface IValidateResult {
    readonly success: boolean;
    readonly message?: string;
}

export interface IMessageValidator {
    validate(msg: IMessage): IValidateResult;
}

export interface IMessageEnricher {
    enrich(msg: IMessage, source?: MessageRef): void;
}

export interface IStoredMessage {
    readonly message: IMessage;
    readonly state: StateRef;
    readonly metadata: IMetadata;
    readonly original: MessageRef;
    readonly spanContext: SpanContext;
}

export interface IStateVerification {
    readonly state: StateRef;
    readonly original: MessageRef;
}

export interface IMessageTypeMapper {
    map<T>(type: IClassType<T>): string;
}

export interface IMessageDeduper {
    isDupe(msg: MessageRef): Promise<{ dupe: boolean; message?: string }>;
}

export function isStoredMessage(obj: any): obj is IStoredMessage {
    return (
        obj && obj.message !== undefined && obj.state !== undefined && obj.original !== undefined
    );
}
