/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    CancelablePromise,
    ConsoleLogger,
    ErrorHandlingMode,
    IDispatchContext,
    IMessage,
    IOutputSink,
    IPublishedMessage,
    JsonMessageEncoder,
    MessageRef,
    StaticInputSource,
    StaticInputSourceType,
} from "@walmartlabs/cookie-cutter-core";
import { QoS } from "mqtt";
import { IMqttAuthConfig, IMqttPublisherConfiguration, MqttMetadata, mqttSink } from "..";
import { AttributeNames } from "../model";

let mockHandlerFunction: jest.Mock;
let mockMqttPublisher: jest.Mock;
const mockTestQos: number = 2;

jest.mock("mqtt", () => {
    return {
        connect: jest.fn(function (_testConfig: any): any {
            return {
                on: mockHandlerFunction,
                publish: mockMqttPublisher,
                removeAllListeners: jest.fn(),
                end: jest.fn(),
            };
        }),
    };
});

class TestEvent {
    public constructor(public value: any) {}
}

function createTestApp(
    inputs: StaticInputSourceType<IMessage | MessageRef>,
    sink: IOutputSink<IPublishedMessage>,
    mockMessageHandlerFunction: any
): CancelablePromise<void> {
    const handler: any = mockMessageHandlerFunction;

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(new StaticInputSource(inputs))
        .done()
        .dispatch(handler)
        .output()
        .published(sink)
        .done()
        .run(ErrorHandlingMode.LogAndFail);
}

describe.each([
    [
        {
            hostName: "test.host.name",
            hostPort: 5678,
            encoder: new JsonMessageEncoder(),
            defaultTopic: "test/publisher/topic1",
        },
        [
            {
                type: TestEvent.name,
                payload: new TestEvent("A"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("B"),
            },
        ],
    ],
    [
        {
            hostName: "test.host.name",
            hostPort: 5678,
            encoder: new JsonMessageEncoder(),
            defaultTopic: "test/publisher/topic2",
            qos: mockTestQos as QoS,
        },
        [
            {
                type: TestEvent.name,
                payload: new TestEvent("C"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("D"),
            },
        ],
    ],
])(
    "Testing MQTT publisher with DEFAULT and USER DEFINED qos and DEFAULT TOPIC",
    (testConfig: IMqttAuthConfig & IMqttPublisherConfiguration, testMessages: IMessage[]) => {
        const mockConnectHandlerFunction: any = (
            event: string,
            callback: (packet: any) => void
        ) => {
            if (event === "connect") {
                callback({
                    cmd: "TESTPUBCMD",
                    returnCode: 90,
                    reasonCode: 5,
                });
            }
        };

        const mockMessageHandlerWithoutTopicMetadata: any = {
            onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
                ctx.publish(TestEvent, new TestEvent(msg.value), {
                    [AttributeNames.eventType]: TestEvent.name,
                });
            },
        };

        afterEach(() => {
            jest.clearAllMocks();
        });

        it("Verifies if CONNECT handler WITH ERROR generated works as expected", async () => {
            mockHandlerFunction = jest.fn(mockConnectHandlerFunction);

            mockMqttPublisher = jest.fn(
                (
                    _testTopic: string,
                    _testMessage: string | Buffer,
                    _opts: any,
                    callback: (error: Error) => void
                ) => {
                    callback(new Error("Some error with the publisher"));
                }
            );

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithoutTopicMetadata
            );

            await testApp;
            expect(mockMqttPublisher).toBeCalledTimes(testMessages.length);
        });

        it("Verifies if CONNECT handler WITHOUT ERROR generated works as expected", async () => {
            mockHandlerFunction = jest.fn(mockConnectHandlerFunction);

            mockMqttPublisher = jest.fn(
                (
                    _testTopic: string,
                    _testMessage: string | Buffer,
                    _opts: any,
                    callback: (error: Error) => void
                ) => {
                    callback(null);
                }
            );

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithoutTopicMetadata
            );

            await testApp;
            expect(mockMqttPublisher).toBeCalledTimes(testMessages.length);
            mockMqttPublisher.mock.calls.forEach((message) => {
                expect(message[0]).toBe(testConfig.defaultTopic);
            });
        });

        it("Verifies if ERROR handler works as expected", async () => {
            mockHandlerFunction = jest.fn((event: string, callback: (error: Error) => void) => {
                if (event === "error") {
                    callback(new Error("This is from a test error"));
                }
            });

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithoutTopicMetadata
            );

            await expect(testApp).rejects.toThrow();
        });
    }
);

describe.each([
    [
        {
            hostName: "test.host.name",
            hostPort: 5678,
            encoder: new JsonMessageEncoder(),
            defaultTopic: "test/publisher/topic",
        },
        [
            {
                type: TestEvent.name,
                payload: new TestEvent("A"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("B"),
            },
        ],
    ],
    [
        {
            hostName: "test.host.name",
            hostPort: 5678,
            encoder: new JsonMessageEncoder(),
            defaultTopic: "test/publisher/topic",
            qos: mockTestQos as QoS,
        },
        [
            {
                type: TestEvent.name,
                payload: new TestEvent("C"),
            },
            {
                type: TestEvent.name,
                payload: new TestEvent("D"),
            },
        ],
    ],
])(
    "Testing MQTT publisher with DEFAULT and USER DEFINED qos and TOPIC in metadata",
    (testConfig: IMqttAuthConfig & IMqttPublisherConfiguration, testMessages: IMessage[]) => {
        const mockConnectHandlerFunction: any = (
            event: string,
            callback: (packet: any) => void
        ) => {
            if (event === "connect") {
                callback({
                    cmd: "TESTPUBCMD",
                    returnCode: 90,
                    reasonCode: 5,
                });
            }
        };

        const mockTopic: string = "my/test/topic";
        const mockMessageHandlerWithTopicMetadata: any = {
            onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
                ctx.publish(TestEvent, new TestEvent(msg.value), {
                    [AttributeNames.eventType]: TestEvent.name,
                    [MqttMetadata.topic]: mockTopic,
                });
            },
        };

        afterEach(() => {
            jest.clearAllMocks();
        });

        it("Verifies if CONNECT handler WITH ERROR generated works as expected", async () => {
            mockHandlerFunction = jest.fn(mockConnectHandlerFunction);

            mockMqttPublisher = jest.fn(
                (
                    _testTopic: string,
                    _testMessage: string | Buffer,
                    _opts: any,
                    callback: (error: Error) => void
                ) => {
                    callback(new Error("Some error with the publisher"));
                }
            );

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithTopicMetadata
            );

            await testApp;
            expect(mockMqttPublisher).toBeCalledTimes(testMessages.length);
        });

        it("Verifies if CONNECT handler WITHOUT ERROR generated works as expected", async () => {
            mockHandlerFunction = jest.fn(mockConnectHandlerFunction);

            mockMqttPublisher = jest.fn(
                (
                    _testTopic: string,
                    _testMessage: string | Buffer,
                    _opts: any,
                    callback: (error: Error) => void
                ) => {
                    callback(null);
                }
            );

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithTopicMetadata
            );

            await testApp;
            expect(mockMqttPublisher).toBeCalledTimes(testMessages.length);
            mockMqttPublisher.mock.calls.forEach((message) => {
                expect(message[0]).toBe(mockTopic);
            });
        });

        it("Verifies if ERROR handler works as expected", async () => {
            mockHandlerFunction = jest.fn((event: string, callback: (error: Error) => void) => {
                if (event === "error") {
                    callback(new Error("This is from a test error"));
                }
            });

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestApp(
                testMessages,
                sink,
                mockMessageHandlerWithTopicMetadata
            );

            await expect(testApp).rejects.toThrow();
        });
    }
);

describe("Testing MQTT publisher WITHOUT default topic or mentioned in metadata", () => {
    const testConfig: IMqttAuthConfig & IMqttPublisherConfiguration = {
        hostName: "test.host.name",
        hostPort: 5678,
        encoder: new JsonMessageEncoder(),
        defaultTopic: "",
    };

    const mockConnectHandlerFunction: any = (event: string, callback: (packet: any) => void) => {
        if (event === "connect") {
            callback({
                cmd: "TESTPUBCMD",
                returnCode: 90,
                reasonCode: 5,
            });
        }
    };

    const mockMessageHandlerWithoutTopicMetadata: any = {
        onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
            ctx.publish(TestEvent, new TestEvent(msg.value), {
                [AttributeNames.eventType]: TestEvent.name,
            });
        },
    };

    const testMessages: IMessage[] = [
        {
            type: TestEvent.name,
            payload: new TestEvent("C"),
        },
        {
            type: TestEvent.name,
            payload: new TestEvent("D"),
        },
    ];

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("Verifies if error is thrown without publisher function being called", async () => {
        mockHandlerFunction = jest.fn(mockConnectHandlerFunction);

        mockMqttPublisher = jest.fn(
            (
                _testTopic: string,
                _testMessage: string | Buffer,
                _opts: any,
                callback: (error: Error) => void
            ) => {
                callback(null);
            }
        );

        const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
        const testApp: any = createTestApp(
            testMessages,
            sink,
            mockMessageHandlerWithoutTopicMetadata
        );

        await expect(testApp).rejects.toThrow();
        expect(mockMqttPublisher).toBeCalledTimes(0);
    });
});
