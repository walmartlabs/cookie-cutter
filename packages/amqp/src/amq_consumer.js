var q = 'testQueue';

var open = require('amqplib').connect('amqp://localhost');

async function consume() {
    console.log("consume");
    const conn = await open;
    const ch = await conn.createChannel();
    const ok = await ch.assertQueue(q);
    let outMsg;
    async function getMsg(msg) {
        console.log("getMsg");
        if (msg !== null) {
            console.log(msg.content.toString());
            ch.ack(msg);
            outMsg = msg;
        }
    }
    if (ok) {
        const res = await ch.consume(q, getMsg);
        console.log(res);
    }
    console.log(outMsg);
}

consume();