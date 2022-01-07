import {
    Application,
    CancelablePromise,
    CapturingOutputSink,
    ConsoleLogger,
    ErrorHandlingMode,
    IDispatchContext,
    IInputSource,
    JsonMessageEncoder,
    ParallelismMode,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import {
    IGcpAuthConfiguration,
    IPubSubMessagePreprocessor,
    IPubSubSubscriberConfiguration,
    MAX_MSG_BATCH_SIZE_SUBSCRIBER,
    pubSubSource,
} from "..";
import { AttributeNames } from "../model";
import { IPubSubMessage } from "../index";

let mockHandlerFunction;
let capturedOutput: any[] = [];

jest.mock("@google-cloud/pubsub", () => {
    return {
        PubSub: jest.fn(function(_testConfig) {
            return {
                subscription: jest.fn(function(_testSubName, _testSubOptions) {
                    return {
                        on: jest.fn(mockHandlerFunction),
                        removeAllListeners: jest.fn(),
                        close: jest.fn(),
                    };
                }),
            };
        }),
    };
});

class TestEvent {
    constructor(public value: any) {}
}

function createTestApp(source: IInputSource): CancelablePromise<void> {
    const handler = {
        onTestEvent: (msg: TestEvent, ctx: IDispatchContext) => {
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
        .run({
            sink: { mode: ErrorHandlingMode.LogAndContinue },
            dispatch: { mode: ErrorHandlingMode.LogAndContinue },
            parallelism: {
                mode: ParallelismMode.Serial,
            },
        });
}

describe("Testing pubsub subscriber WITH DEFAULT batch size", () => {
    const testConfig: IGcpAuthConfiguration & IPubSubSubscriberConfiguration = {
        projectId: "test_project_id",
        clientEmail: "test@testserver.com",
        privateKey: "test_private_key",
        encoder: new JsonMessageEncoder(),
        subscriptionName: "test_subscription_name",
    };

    beforeEach(() => {
        capturedOutput = [];
    });

    it("Verifying 'error' event listener", async () => {
        mockHandlerFunction = (event: string, callback: (error: any) => void): void => {
            if (event === "error") {
                callback(new Error("This is a test error"));
            }
        };
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);
        await expect(testApp).rejects.toThrow();
    });

    it("verifying 'message' event listener", async () => {
        mockHandlerFunction = (event: string, callback: (msg: any) => void): void => {
            if (event === "message") {
                for (let i = 1; i <= MAX_MSG_BATCH_SIZE_SUBSCRIBER; i++) {
                    const message = {
                        id: `id-${i}`,
                        ackId: `ackId-${i}`,
                        data: `This is message ${i}`,
                        attributes: {
                            eventType: "TestEvent",
                            dt: new Date().toUTCString(),
                        },
                        publishTime: new Date().toUTCString(),
                        ack: jest.fn(),
                    };
                    callback(message);
                }
            }
        };
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);

        while (capturedOutput.length < MAX_MSG_BATCH_SIZE_SUBSCRIBER) {
            await sleep(50);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(MAX_MSG_BATCH_SIZE_SUBSCRIBER);
    });
});

describe("Testing pubsub subscriber WITH USER SPECIFIED batch size", () => {
    const testConfig: IGcpAuthConfiguration & IPubSubSubscriberConfiguration = {
        projectId: "test_project_id",
        clientEmail: "test@testserver.com",
        privateKey: "test_private_key",
        encoder: new JsonMessageEncoder(),
        subscriptionName: "test_subscription_name",
        maxMsgBatchSize: 10,
    };

    beforeEach(() => {
        capturedOutput = [];
    });

    it("verifying 'message' event listener", async () => {
        mockHandlerFunction = (event: string, callback: (msg: any) => void): void => {
            if (event === "message") {
                for (let i = 1; i <= testConfig.maxMsgBatchSize; i++) {
                    const message = {
                        id: `id-${i}`,
                        ackId: `ackId-${i}`,
                        data: `This is message ${i}`,
                        attributes: {
                            eventType: "TestEvent",
                            dt: new Date().toUTCString(),
                        },
                        publishTime: new Date().toUTCString(),
                        ack: jest.fn(),
                    };
                    callback(message);
                }
            }
        };
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);

        while (capturedOutput.length < testConfig.maxMsgBatchSize) {
            await sleep(50);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(testConfig.maxMsgBatchSize);
    });
});

describe("Testing pubsub subscriber with message preprocessor", () => {
    function pubSubMessagePreprocessor(): IPubSubMessagePreprocessor {
        return {
            process(payload: any): IPubSubMessage {
                return {
                    attributes: {
                        eventType: "TestEvent",
                        dt: payload.publishTime,
                    },
                    data: {
                        id: payload.id,
                        data: payload.data,
                    },
                };
            },
        };
    }

    const testConfig: IGcpAuthConfiguration & IPubSubSubscriberConfiguration = {
        projectId: "test_project_id",
        clientEmail: "test@testserver.com",
        privateKey: "test_private_key",
        encoder: new JsonMessageEncoder(),
        subscriptionName: "test_subscription_name",
        maxMsgBatchSize: 5,
        preprocessor: pubSubMessagePreprocessor(),
    };

    beforeEach(() => {
        capturedOutput = [];
    });

    it("verifying 'message' event listener", async () => {
        mockHandlerFunction = (event: string, callback: (msg: any) => void): void => {
            if (event === "message") {
                for (let i = 1; i <= testConfig.maxMsgBatchSize; i++) {
                    const message = {
                        id: `id-${i}`,
                        ackId: `ackId-${i}`,
                        data: `This is message ${i}`,
                        publishTime: new Date().toUTCString(),
                        ack: jest.fn(),
                    };
                    callback(message);
                }
            }
        };
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);

        while (capturedOutput.length < testConfig.maxMsgBatchSize) {
            await sleep(50);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(testConfig.maxMsgBatchSize);
    });
});
