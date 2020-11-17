// code example adapted from https://docs.microsoft.com/en-us/azure/storage/queues/storage-quickstart-queues-nodejs

const { QueueClient } = require("@azure/storage-queue");

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
const queueName = "queueone";

async function main() {
    const queueClient = new QueueClient(connStr, queueName);

    // Create queue
    console.log("\nCreating queue...");
    console.log("\t", queueName);

    // Create the queue
    const createQueueResponse = await queueClient.create();
    console.log("Queue created, requestId:", createQueueResponse.requestId);

    console.log("\nAdding messages to the queue...");

    // Send several messages to the queue
    await queueClient.sendMessage("First message");
    await queueClient.sendMessage("Second message");
    const sendMessageResponse = await queueClient.sendMessage("Third message");

    console.log("Messages added, requestId:", sendMessageResponse.requestId);

    console.log("\nPeek at the messages in the queue...");

    // Peek at messages in the queue
    const peekedMessages = await queueClient.peekMessages({ numberOfMessages : 5 });

    for (i = 0; i < peekedMessages.peekedMessageItems.length; i++) {
        // Display the peeked message
        console.log("\t", peekedMessages.peekedMessageItems[i].messageText);
    }

    console.log("\nUpdating the third message in the queue...");

    // Update a message using the response saved when calling sendMessage earlier
    updateMessageResponse = await queueClient.updateMessage(
        sendMessageResponse.messageId,
        sendMessageResponse.popReceipt,
        "Third message has been updated"
    );

    console.log("Message updated, requestId:", updateMessageResponse.requestId);

    console.log("\nReceiving messages from the queue...");

    // Get messages from the queue
    const receivedMessagesResponse = await queueClient.receiveMessages({ numberOfMessages : 5 });

    console.log("Messages received, requestId:", receivedMessagesResponse.requestId);

    // 'Process' and delete messages from the queue
    for (i = 0; i < receivedMessagesResponse.receivedMessageItems.length; i++) {
        receivedMessage = receivedMessagesResponse.receivedMessageItems[i];

        // 'Process' the message
        console.log("\tProcessing:", receivedMessage.messageText);

        // Delete the message
        const deleteMessageResponse = await queueClient.deleteMessage(
            receivedMessage.messageId,
            receivedMessage.popReceipt
        );
        console.log("\tMessage deleted, requestId:", deleteMessageResponse.requestId);
    }

    // Delete the queue
    console.log("\nDeleting queue...");
    const deleteQueueResponse = await queueClient.delete();
    console.log("Queue deleted, requestId:", deleteQueueResponse.requestId);
}

main().then(() => {console.log("Queue Main Done");}).catch((error) => {
    console.error(error);
});