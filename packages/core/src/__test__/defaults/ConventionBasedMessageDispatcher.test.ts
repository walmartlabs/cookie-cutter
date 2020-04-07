/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { MockTracer } from "opentracing";
import {
    ConventionBasedMessageDispatcher,
    EncodedMessage,
    IDispatchContext,
    IMessage,
    JsonMessageEncoder,
    NullMetrics,
} from "../..";
import { TraceContext } from "../../internal";
import { createRetrierContext, RetrierContext } from "../../utils";

interface ITrigger {
    readonly name: string;
}

class DispatchTarget {
    public onTrigger(msg: ITrigger, ctx: IDispatchContext): void {
        ctx.logger.info(msg.name);
    }

    public onRpcHandler(msg: ITrigger): string {
        return msg.name;
    }
}

class AsyncDispatchTarget {
    public onTrigger(msg: ITrigger, ctx: IDispatchContext): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                ctx.logger.info(msg.name);
                resolve();
            }, 100);
        });
    }

    public onRpcHandler(msg: ITrigger): Promise<string> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(msg.name);
            }, 100);
        });
    }
}

const retry: RetrierContext = createRetrierContext(10);

function mockContext(): IDispatchContext {
    return {
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        },
        metrics: new NullMetrics(),
        state: {
            get: jest.fn(),
            compute: jest.fn(),
        },
        trace: new TraceContext(new MockTracer(), null),
        metadata: jest.fn(),
        publish: jest.fn(),
        services: {
            get: jest.fn(),
        },
        store: jest.fn(),
        typeName: jest.fn(),
        bail: retry.bail,
        retry,
    };
}

describe("ConventionBasedMessageDispatcher", () => {
    it("invokes function with a encoded message as input", async () => {
        const encoder = new JsonMessageEncoder();
        const buffer = encoder.encode({ type: "test.Trigger", payload: { name: "test" } });
        const msg = new EncodedMessage(encoder, "test.Trigger", Buffer.from(buffer));

        const dispatcher = new ConventionBasedMessageDispatcher(new DispatchTarget());
        const ctx = mockContext();

        await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
        expect(ctx.logger.info).toBeCalledWith("test");
    });

    it("invokes function by message type name", async () => {
        const msg: IMessage = {
            type: "test.Trigger",
            payload: {
                name: "test",
            },
        };

        const dispatcher = new ConventionBasedMessageDispatcher(new DispatchTarget());
        const ctx = mockContext();

        await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
        expect(ctx.logger.info).toBeCalledWith("test");
    });

    it("returns handler's return value", async () => {
        const msg: IMessage = {
            type: "test.RpcHandler",
            payload: {
                name: "test",
            },
        };

        const dispatcher = new ConventionBasedMessageDispatcher(new DispatchTarget());
        const ctx = mockContext();

        const actual = await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
        expect(actual).toBe(msg.payload.name);
    });

    it("returns async handler's return value", async () => {
        const msg: IMessage = {
            type: "test.RpcHandler",
            payload: {
                name: "test",
            },
        };

        const dispatcher = new ConventionBasedMessageDispatcher(new AsyncDispatchTarget());
        const ctx = mockContext();

        const actual = await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
        expect(actual).toBe(msg.payload.name);
    });

    it("awaits async message handlers", async () => {
        const msg: IMessage = {
            type: "test.Trigger",
            payload: {
                name: "test",
            },
        };

        const dispatcher = new ConventionBasedMessageDispatcher(new AsyncDispatchTarget());
        const ctx = mockContext();

        await dispatcher.dispatch(msg, ctx, { validation: { success: true } });
        expect(ctx.logger.info).toBeCalledWith("test");
    });

    it("indicates if it can dispatch a message", () => {
        const msg1: IMessage = {
            type: "test.Trigger",
            payload: {
                name: "test",
            },
        };
        const msg2: IMessage = {
            type: "test.UnknownMessage",
            payload: {
                name: "test",
            },
        };

        const dispatcher = new ConventionBasedMessageDispatcher(new DispatchTarget());
        expect(dispatcher.canDispatch(msg1)).toBeTruthy();
        expect(dispatcher.canDispatch(msg2)).toBeFalsy();
    });
});
