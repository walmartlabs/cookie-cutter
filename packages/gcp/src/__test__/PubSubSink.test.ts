/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { PubSub } from "@google-cloud/pubsub";
import {
    IMessage,
    MessageRef,
    JsonMessageEncoder,
    IPublishedMessage,
    StaticInputSourceType,
    ErrorHandlingMode,
    CancelablePromise,
    IDispatchContext,
    Application,
    ConsoleLogger,
    StaticInputSource,
    IOutputSink,
} from "@walmartlabs/cookie-cutter-core";
import { IPubSubPublisherConfiguration, IGcpAuthConfiguration, pubSubSink } from "..";
import { PubSubMetadata } from "../PubSubSink";
import { AttributeNames } from "../model";

jest.mock("@google-cloud/pubsub", () => {
    return {
        PubSub: jest.fn(),
    };
});

class TestEvent {
    constructor(public value: string, public topic?: string, public orderingKey?: string) {}
}

function createTestApp(
    inputs: StaticInputSourceType<IMessage | MessageRef>,
    sink: IOutputSink<IPublishedMessage>,
    retryMode: ErrorHandlingMode
): CancelablePromise<void> {
    const handler = {
        onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
            const metadata = {};
            if (msg.topic) {
                metadata[PubSubMetadata.Topic] = msg.topic;
            }
            if (msg.orderingKey) {
                metadata[PubSubMetadata.Key] = msg.orderingKey;
            }
            ctx.publish(TestEvent, new TestEvent(msg.value), metadata);
        },
    };

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new StaticInputSource(inputs))
        .done()
        .output()
        .published(sink)
        .done()
        .dispatch(handler)
        .run(retryMode);
}

describe("PubSubSink Tests", () => {
    const gcsAuthConfig: IGcpAuthConfiguration = {
        projectId: "projectId",
        clientEmail: "clinetEmail",
        privateKey: "key",
    };
    const pubSubPublisherConfigurationWithDefaultTopic: IPubSubPublisherConfiguration = {
        defaultTopic: "defaultTopic",
        encoder: new JsonMessageEncoder(),
    };
    const err = new Error("Test Error");
    const messagesWithoutTopic: IMessage[] = [
        {
            type: TestEvent.name,
            payload: new TestEvent("A"),
        },
        {
            type: TestEvent.name,
            payload: new TestEvent("B"),
        },
    ];
    const mockPubSub: jest.Mock = PubSub as any;
    const mockPublishFn = jest.fn();
    const mockTopic = jest.fn();
    let sink;

    beforeEach(() => {
        const mockFns = {
            topic: mockTopic,
            publishMessage: mockPublishFn,
            close: jest.fn(),
        };
        mockPublishFn.mockResolvedValue("messageId");
        mockTopic.mockImplementation(() => mockFns);
        mockPubSub.mockImplementation(() => mockFns);
        sink = pubSubSink({
            ...gcsAuthConfig,
            ...pubSubPublisherConfigurationWithDefaultTopic,
        });
    });

    it("writes to default topic in pubsub", async () => {
        const testApp = createTestApp(messagesWithoutTopic, sink, ErrorHandlingMode.LogAndContinue);
        await testApp;
        expect(mockPubSub).toBeCalledTimes(1);
        expect(mockTopic).toBeCalledTimes(1);
        expect(mockTopic.mock.calls[0]).toContain(
            pubSubPublisherConfigurationWithDefaultTopic.defaultTopic
        );
        expect(mockPublishFn).toBeCalledTimes(messagesWithoutTopic.length);
        messagesWithoutTopic.forEach((message, idx) => {
            expect(mockPublishFn.mock.calls[idx][0].attributes[AttributeNames.eventType]).toBe(
                message.type
            );
            expect(mockPublishFn.mock.calls[idx][0].attributes[AttributeNames.contentType]).toBe(
                pubSubPublisherConfigurationWithDefaultTopic.encoder.mimeType
            );
        });
    });

    it("writes to topic specified in metadata", async () => {
        const messagesWithTopic: IMessage[] = [
            {
                type: TestEvent.name,
                payload: new TestEvent("A", "TopicA"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("B", "TopicB"),
            },
        ];
        const testApp = createTestApp(messagesWithTopic, sink, ErrorHandlingMode.LogAndContinue);
        await testApp;
        expect(mockPubSub).toBeCalledTimes(1);
        expect(mockTopic).toBeCalledTimes(messagesWithTopic.length);
        messagesWithTopic.forEach((message, idx) => {
            expect(mockTopic.mock.calls[idx]).toContain(message.payload.topic);
            expect(mockTopic.mock.calls[idx][1].messageOrdering).toBeFalsy();
        });
        expect(mockPublishFn).toBeCalledTimes(messagesWithTopic.length);
        messagesWithTopic.forEach((message, idx) => {
            expect(mockPublishFn.mock.calls[idx][0].attributes[AttributeNames.eventType]).toBe(
                message.type
            );
            expect(mockPublishFn.mock.calls[idx][0].attributes[AttributeNames.contentType]).toBe(
                pubSubPublisherConfigurationWithDefaultTopic.encoder.mimeType
            );
            expect(mockPublishFn.mock.calls[idx][0][PubSubMetadata.Key]).toBeUndefined();
        });
    });

    it("with orderingKey", async () => {
        const messagesWithTopic: IMessage[] = [
            {
                type: TestEvent.name,
                payload: new TestEvent("A", "TopicA", "test-key"),
            },
        ];
        const testApp = createTestApp(messagesWithTopic, sink, ErrorHandlingMode.LogAndContinue);
        await testApp;
        expect(mockPubSub).toBeCalledTimes(1);
        expect(mockTopic).toBeCalledTimes(messagesWithTopic.length);
        messagesWithTopic.forEach((message, idx) => {
            expect(mockTopic.mock.calls[idx]).toContain(message.payload.topic);
            expect(mockTopic.mock.calls[idx][1].messageOrdering).toBeTruthy();
        });
        expect(mockPublishFn).toBeCalledTimes(messagesWithTopic.length);
        messagesWithTopic.forEach((message, idx) => {
            expect(mockPublishFn.mock.calls[idx][0][PubSubMetadata.Key]).toBe(
                message.payload.orderingKey
            );
        });
    });

    it("with orderingKey for one message and no ordering key for 2nd message", async () => {
        const messagesWithTopic: IMessage[] = [
            {
                type: TestEvent.name,
                payload: new TestEvent("A", "TopicA", "test-key1"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("A", "TopicA"),
            },
        ];
        const testApp = createTestApp(messagesWithTopic, sink, ErrorHandlingMode.LogAndContinue);
        await testApp;
        expect(mockTopic).toBeCalledTimes(1);
        expect(mockPubSub).toBeCalledTimes(1);
        messagesWithTopic.forEach((message) => {
            expect(mockTopic.mock.calls[0]).toContain(message.payload.topic);
            expect(mockTopic.mock.calls[0][1].messageOrdering).toBeTruthy();
        });
        expect(mockPublishFn).toBeCalledTimes(messagesWithTopic.length);
        messagesWithTopic.forEach((message, idx) => {
            expect(mockPublishFn.mock.calls[idx][0][PubSubMetadata.Key]).toBe(
                message.payload.orderingKey
            );
            expect(mockPublishFn.mock.calls[idx][0].attributes[AttributeNames.eventType]).toBe(
                message.type
            );
        });
    });

    it("rejects on error from PubSub topic", async () => {
        const testApp = createTestApp(messagesWithoutTopic, sink, ErrorHandlingMode.LogAndFail);
        mockTopic.mockImplementation(() => {
            throw err;
        });
        await expect(testApp).rejects.toThrowError();
    });

    it("rejects on error from PubSub topic", async () => {
        const testApp = createTestApp(messagesWithoutTopic, sink, ErrorHandlingMode.LogAndFail);
        mockPublishFn.mockImplementation(() => {
            throw err;
        });
        await expect(testApp).rejects.toThrowError();
    });
});
