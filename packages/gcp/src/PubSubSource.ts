import { PubSub, Subscription } from "@google-cloud/pubsub";
import { IInputSource, IInputSourceContext, IMessage, MessageRef, sleep } from "@walmartlabs/cookie-cutter-core"
import { IGcpAuthConfiguration } from ".";
import { IRawPubSubMessage } from "./model";

/*
* implements pull delivery for subscriber apps reading from a topic
*/
export class PubSubPullSource implements IInputSource {
    private subscriber: Subscription;
    private done: boolean = false;
    // array to store a batch of messages
    private messages: IRawPubSubMessage[] =[];

    constructor(private readonly config: IGcpAuthConfiguration, private readonly subscriptionName: string, private  timeout_sec: number = 60) {
        /*
        * need to include - error handling if subscription name is incorrect
        */
        this.subscriber = new PubSub({
            projectId: this.config.projectId,
            credentials: {
                client_email: this.config.clientEmail,
                private_key: this.config.privateKey,
            },
        }).subscription(this.subscriptionName);
    }

    public async *start(context: IInputSourceContext): AsyncIterableIterator<MessageRef> {
        while(!this.done) {
            // listen for messages until timeout is reached
            this.subscriber.on('message', this.consume);

            setTimeout(() => {
                this.subscriber.removeListener('message', this.consume);
                // log how many messages was received in this batch
            }, this.timeout_sec * 1000);

            let message: IRawPubSubMessage;
            for(message of this.messages) {
                //const span = ; --> fill this
                const data: IMessage = {
                    type: "PubSub",
                    payload: message.data,
                };
                const msg = new MessageRef(
                    {
                        "attibutes": message.attributes,
                        "eventTime": message.publishTime,
                    },
                    data,
                    // feed in the span context
                );
                /*
                msg.once("released", () => {
                    span.finish();
                });*/

                yield msg;
                await sleep(100);
            }
            
        }
    }

    public async stop(): Promise<void> {
        this.done = true;
    }

    private consume(message: any): void {
       this.messages.push(message);
        message.ack();
    }
}