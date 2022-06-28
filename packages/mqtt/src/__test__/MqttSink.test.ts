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
import { IMqttAuthConfig, IMqttPublisherConfiguration, mqttSink } from "..";
import { AttributeNames } from "../model";

let mockHandlerFunction: jest.Mock;
let mockMqttPublisher: jest.Mock;
const mockTestQos: number = 2;

jest.mock("mqtt", () => {
    return {
        connect: jest.fn(function(_testConfig: any): any {
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

function createTestAp(
    inputs: StaticInputSourceType<IMessage | MessageRef>,
    sink: IOutputSink<IPublishedMessage>
): CancelablePromise<void> {
    const handler: any = {
        onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
            ctx.publish(TestEvent, new TestEvent(msg.value), {
                [AttributeNames.eventType]: "TestEvent",
            });
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
        .run(ErrorHandlingMode.LogAndContinue);
}

describe.each([
    [
        {
            hostName: "test.host.name",
            hostPort: 5678,
            encoder: new JsonMessageEncoder(),
            topic: "test/publisher/topic",
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
            topic: "test/publisher/topic",
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
    "Testing MQTT publisher with DEFAULT and USER DEFINED qos",
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
            const testApp: any = createTestAp(testMessages, sink);

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
            const testApp: any = createTestAp(testMessages, sink);

            await testApp;
            expect(mockMqttPublisher).toBeCalledTimes(testMessages.length);
        });

        it("Verifies if ERROR handler works as expected", async () => {
            mockHandlerFunction = jest.fn((event: string, callback: (error: Error) => void) => {
                if (event === "error") {
                    callback(new Error("This is from a test error"));
                }
            });

            const sink: IOutputSink<IPublishedMessage> = mqttSink({ ...testConfig });
            const testApp: any = createTestAp(testMessages, sink);

            await expect(testApp).rejects.toThrow();
        });
    }
);
