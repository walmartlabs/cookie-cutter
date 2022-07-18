/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    CancelablePromise,
    CapturingOutputSink,
    ConsoleLogger,
    ErrorHandlingMode,
    IDispatchContext,
    IInputSource,
    JsonMessageEncoder,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { QoS } from "mqtt";
import {
    IMqttAuthConfig,
    IMqttMessage,
    IMqttPreprocessor,
    IMqttSubscriberConfiguration,
    mqttSource,
} from "..";
import { AttributeNames } from "../model";

let mockHandlerFunction: jest.Mock;
let capturedOutput: any[] = [];
const mockMqttSubscribe: jest.Mock = jest.fn();
const mockMqttUnsubscribe: jest.Mock = jest.fn();
const testSleepTime: number = 50;
const mockTestQos1: number = 1;
const mockTestQos2: number = 2;
const mockSubscriberTopic: string = "test/subscriber/topic";
const mockTestMessageData: string = "this is test message";

jest.mock("mqtt", () => {
    return {
        connect: jest.fn(function (_testConfig: any): any {
            return {
                on: mockHandlerFunction,
                subscribe: mockMqttSubscribe,
                unsubscribe: mockMqttUnsubscribe,
                removeAllListeners: jest.fn(),
                end: jest.fn(),
            };
        }),
        subscribe: jest.fn(),
    };
});

class TestEvent {
    public constructor(public value: any) {}
}

function createTestApp(source: IInputSource): CancelablePromise<void> {
    const handler: any = {
        onTestEvent: async (msg: TestEvent, ctx: IDispatchContext): Promise<void> => {
            ctx.publish(TestEvent, new TestEvent(msg.value), {
                [AttributeNames.eventType]: "TestEvent",
            });
        },
    };

    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(source)
        .done()
        .dispatch(handler)
        .output()
        .published(new CapturingOutputSink(capturedOutput))
        .done()
        .run(ErrorHandlingMode.LogAndContinue);
}

describe.each([
    {
        hostName: "test.host",
        hostPort: 1234,
        encoder: new JsonMessageEncoder(),
        topic: mockSubscriberTopic,
    },
    {
        hostName: "test.host",
        hostPort: 1234,
        encoder: new JsonMessageEncoder(),
        topic: mockSubscriberTopic,
        qos: mockTestQos2 as QoS,
    },
    {
        hostName: "test.host",
        hostPort: 1234,
        encoder: new JsonMessageEncoder(),
        topic: mockSubscriberTopic,
        queueSize: 5,
    },
    {
        hostName: "test.host",
        hostPort: 1234,
        encoder: new JsonMessageEncoder(),
        topic: mockSubscriberTopic,
        queueSize: 5,
        qos: mockTestQos1 as QoS,
    },
])(
    "Testing MQTT subscriber with combination of DEFAULT and USER DEFINED values for queue size and qos",
    (testConfig: IMqttAuthConfig & IMqttSubscriberConfiguration) => {
        beforeEach(() => {
            capturedOutput = [];
        });

        afterEach(() => {
            mockMqttSubscribe.mockClear();
            mockMqttUnsubscribe.mockClear();
        });

        it("Verifies if CONNECT handler works as expected", async () => {
            mockHandlerFunction = jest.fn((event: string, callback: (packet: any) => void) => {
                if (event === "connect") {
                    callback({
                        cmd: "TESTCMD",
                        returnCode: 100,
                        reasonCode: 50,
                    });
                }
            });

            const source: IInputSource = mqttSource({ ...testConfig });
            const testApp: any = createTestApp(source);

            testApp.cancel();
            await testApp;
            expect(mockMqttSubscribe).toBeCalledTimes(1);
            expect(mockMqttUnsubscribe).toBeCalledTimes(1);
        });

        it("Verifies if MESSAGE handler works as expected", async () => {
            const testNumberMessages: number = 3;

            mockHandlerFunction = jest.fn(
                (event: string, callback: (topic: string, payload: Buffer) => void) => {
                    if (event === "message") {
                        for (let i: number = 0; i < testNumberMessages; i++) {
                            const testMessage: any = {
                                attributes: {
                                    eventType: TestEvent.name,
                                },
                                data: {
                                    message: mockTestMessageData,
                                    repeatTime: i,
                                },
                            };

                            callback(mockSubscriberTopic, Buffer.from(JSON.stringify(testMessage)));
                        }
                    }
                }
            );

            const source: IInputSource = mqttSource({ ...testConfig });
            const testApp: any = createTestApp(source);

            while (capturedOutput.length < testNumberMessages) {
                await sleep(testSleepTime);
            }

            testApp.cancel();
            await testApp;
            expect(capturedOutput.length).toBe(testNumberMessages);
            expect(mockMqttUnsubscribe).toBeCalledTimes(1);
        });

        it("Verifies if ERROR handler works as expected", async () => {
            mockHandlerFunction = jest.fn((event: string, callback: (error: Error) => void) => {
                if (event === "error") {
                    callback(new Error(mockTestMessageData));
                }
            });

            const source: IInputSource = mqttSource({ ...testConfig });
            const testApp: any = createTestApp(source);
            await expect(testApp).rejects.toThrow();
            expect(mockMqttUnsubscribe).toBeCalledTimes(1);
        });
    }
);

describe("Testing mqtt subscriber preprocessor", () => {
    function mqttMessagePreprocessor(): IMqttPreprocessor {
        return {
            process(payload: any): IMqttMessage {
                const data: any = JSON.parse(Buffer.from(payload).toString());
                return {
                    attributes: {
                        eventType: TestEvent.name,
                        dt: Date.now().toString(),
                    },
                    data: Buffer.from(JSON.stringify(data)),
                };
            },
        };
    }

    beforeEach(() => {
        capturedOutput = [];
    });

    afterEach(() => {
        mockMqttUnsubscribe.mockClear();
    });

    it("Verifies with preprocessor works as expected", async () => {
        const testConfig: IMqttAuthConfig & IMqttSubscriberConfiguration = {
            hostName: "test.host",
            hostPort: 1234,
            encoder: new JsonMessageEncoder(),
            topic: mockSubscriberTopic,
            preprocessor: mqttMessagePreprocessor(),
        };
        const testNumberMessages: number = 3;

        mockHandlerFunction = jest.fn(
            (event: string, callback: (topic: string, payload: Buffer) => void) => {
                if (event === "message") {
                    for (let i: number = 0; i < testNumberMessages; i++) {
                        const testMessage: any = {
                            data: {
                                message: mockTestMessageData,
                                repeatTime: i,
                            },
                        };

                        callback(mockSubscriberTopic, Buffer.from(JSON.stringify(testMessage)));
                    }
                }
            }
        );

        const source: IInputSource = mqttSource({ ...testConfig });
        const testApp: any = createTestApp(source);

        while (capturedOutput.length < testNumberMessages) {
            await sleep(testSleepTime);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(testNumberMessages);
        expect(mockMqttUnsubscribe).toBeCalledTimes(1);
    });

    it("Verifies with preprocessor works as expected with data being buffer", async () => {
        const testConfig: IMqttAuthConfig & IMqttSubscriberConfiguration = {
            hostName: "test.host",
            hostPort: 1234,
            encoder: new JsonMessageEncoder(),
            topic: mockSubscriberTopic,
            preprocessor: mqttMessagePreprocessor(),
        };

        const testNumberMessages: number = 3;

        mockHandlerFunction = jest.fn(
            (event: string, callback: (topic: string, payload: Buffer) => void) => {
                if (event === "message") {
                    for (let i: number = 0; i < testNumberMessages; i++) {
                        const testMessage: any = {
                            data: {
                                type: "Buffer",
                                data: [mockTestMessageData, i],
                            },
                        };

                        callback(mockSubscriberTopic, Buffer.from(JSON.stringify(testMessage)));
                    }
                }
            }
        );

        const source: IInputSource = mqttSource({ ...testConfig });
        const testApp: any = createTestApp(source);

        while (capturedOutput.length < testNumberMessages) {
            await sleep(testSleepTime);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(testNumberMessages);
        expect(mockMqttUnsubscribe).toBeCalledTimes(1);
    });
});
