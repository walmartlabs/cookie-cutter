import { PubSub, Subscription } from "@google-cloud/pubsub";
import { IComponentContext, IInputSource, IInputSourceContext, ILogger, IMessage, MessageRef, sleep } from "@walmartlabs/cookie-cutter-core"
import { IGcpAuthConfiguration } from ".";
import { Tracer } from "opentracing";

/*
* implements pull delivery for subscriber apps reading from a topic
*/
export class PubSubPullSource implements IInputSource {
    private subscriber: Subscription;
    private done: boolean = false;
    private tracer: Tracer;
    private logger: ILogger;
    // array to store a batch of messages - # of msgs in array is defined by maxMsgBatchSize
    private messages: any[] =[];

    constructor(private readonly config: IGcpAuthConfiguration, private readonly subscriptionName: string, private readonly maxMsgBatchSize: number = 10) {
        /*
        * need to include - error handling if subscription name is incorrect
        * The subscriber is only allowed to process msgBatchSize messages in a single batch
        * The service account is authenticated by feeding in the credentials or by putting the json cred file in the environment set to GOOGLE_APPLICATION_CREDENTIALS
        */
        this.subscriber = new PubSub({
            projectId: this.config.projectId,
        }).subscription(this.subscriptionName, {
            flowControl: {
                maxMessages: this.maxMsgBatchSize,
            },
        });
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.logger = context.logger;
    }

    public async *start(context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        /*
        * reads max of maxMsgBatchSize from the subsc
        */
        this.subscriber.on('message', (message) => {
            this.messages.push(message);
        });

        /*
        * for the subscriber there is an 'error' event handler that needs to be added. this will log the errors
        * and then gracefully remove the event 'message' listner and stop the cookie cutter app
        */

        let message: any;
        while(!this.done) {
            while(this.messages.length !== 0) {
                message = this.messages.pop();

                const span = this.tracer.startSpan("Consuming messages from Google PubSub");
                const data: IMessage = {
                    type: "Google PubSub",
                    payload: message.data,
                };

                const msg = new MessageRef(
                    {
                        "attibutes": message.attributes,
                        "eventTime": message.publishTime,
                    },
                    data,
                    span.context(),
                );

                msg.once("released", async (msg, __, err): Promise<void> => {
                    if(err) {
                        this.logger.error("Unable to release message", err);
                    }
                    span.finish();
                });

                yield msg;
                await sleep(100);
            }
            await sleep(100);
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
        // need to remove the event listner from subscriber once service has been stopped
    }
}