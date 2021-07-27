import { AsyncPipe, sleep } from "@walmartlabs/cookie-cutter-core";

function log(s: string) {
    // tslint:disable-next-line:no-console
    console.log(s);
}

const pipe = new AsyncPipe();

function sendBefore(response: number): Promise<void> {
    return pipe.send(response);
}

async function iter(n: number) {
    for (let ii = 0; ii < n; ii++) {
        const it = await pipe.next();
        log(`IT: ${it}`);
    }
}

async function sendLoop(n: number, _delay: number) {
    log("sendLoop");
    for (let ii = 0; ii < n; ii++) {
        log(`ii: ${ii}, n: ${n}`);
        await sendBefore(ii);
        await sleep(_delay);
    }
}

const num = 1000;
const delay = 100;
async function doStuff() {
    setInterval(async () => {
        log("Timer triggered");
        await sendBefore(987650000);
    }, 10).unref();
    iter(num);
    log("Before SendLoop");
    await sendLoop(num, delay);
    log("After SendLoop");
    await pipe.close();
}

doStuff();
