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
    IPubSubSubscriberConfiguration,
    MAX_MSG_BATCH_SIZE_SUBSCRIBER,
    pubSubSource,
} from "../index";
import { AttributeNames } from "../PubSubSink";

let mockHandlerFunction;
const capturedOutput: any[] = [];

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

const testConfig: IGcpAuthConfiguration & IPubSubSubscriberConfiguration = {
    projectId: "test_project_id",
    clientEmail: "test@testserver.com",
    privateKey: "test_private_key",
    encoder: new JsonMessageEncoder(),
    subscriptionName: "test_subscription_name",
};

const mockMessageEventHandler = (event: string, callback: (msg: any) => void): void => {
    if (event === "message") {
        for (let i = 1; i <= (testConfig.maxMsgBatchSize || MAX_MSG_BATCH_SIZE_SUBSCRIBER); i++) {
            const message = {
                id: `id-${i}`,
                ackId: `ackId-${i}`,
                data: `This is message ${i}`,
                attributes: {
                    event_type: "TestEvent",
                },
                publishTime: new Date().toUTCString(),
                ack: jest.fn(),
            };
            callback(message);
        }
    }
};

const mockErrorEventHandler = (event: string, callback: (error: any) => void): void => {
    if (event === "error") {
        callback(new Error("This is a test error"));
    }
};

describe("Testing of pubsub subscriber service", () => {
    it("Verifying 'error' event listener", async () => {
        mockHandlerFunction = mockErrorEventHandler;
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);
        await expect(testApp).rejects.toThrow();
    });

    it("verifying 'message' event listner gets messages and sends downstream", async () => {
        mockHandlerFunction = mockMessageEventHandler;
        const source = pubSubSource({ ...testConfig });
        const testApp = createTestApp(source);

        while (
            capturedOutput.length < (testConfig.maxMsgBatchSize || MAX_MSG_BATCH_SIZE_SUBSCRIBER)
        ) {
            await sleep(50);
        }

        testApp.cancel();
        await testApp;
        expect(capturedOutput.length).toBe(
            testConfig.maxMsgBatchSize || MAX_MSG_BATCH_SIZE_SUBSCRIBER
        );
    });
});
