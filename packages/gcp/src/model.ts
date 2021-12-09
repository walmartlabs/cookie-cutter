export interface IRawPubSubMessage {
    // id of message
    id: string,
    // id used to ack message receival
    ackId: string,
    // the data field. If empty must contain at least one attribute
    data?: string,
    // attributes for message. This can be used to filter messages on subscription
    attributes?: Map<string, string>,
    /*
    * Date when pub/sub server received the message
    * Time stampin RFC3339 UTC Zulu format with nanosecond resolution upto nine fractional digits
    * https://cloud.google.com/pubsub/docs/reference/rest/v1/PubsubMessage
    */
    publishTime: string,
    orderingKey?: string,
}