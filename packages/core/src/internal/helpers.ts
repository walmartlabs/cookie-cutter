/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger } from "..";
import { BoundedPriorityQueue } from "../utils";

export async function* roundRobinIterators<T>(
    inputs: AsyncIterableIterator<T>[],
    logger: ILogger
): AsyncIterableIterator<T> {
    const pipe = new BoundedPriorityQueue<T>(1);

    let done = 0;
    for (const input of inputs) {
        // tslint:disable-next-line:no-floating-promises
        (async () => {
            try {
                for await (const item of input) {
                    if (!(await pipe.enqueue(item))) {
                        break;
                    }
                }
            } catch (e) {
                // ignore, close pipe
                logger.warn("Error iterating input source", { msg: e });
            } finally {
                if (++done === inputs.length) {
                    pipe.close();
                }
            }
        })();
    }

    yield* pipe.iterate();
}

export function dumpOpenHandles(logger: ILogger): void {
    const wtf = require("wtfnode");
    const util = require("util");
    wtf.setLogger("info", (...args: any[]) => {
        logger.info(util.format.apply(util, args));
    });
    wtf.setLogger("warn", (...args: any[]) => {
        logger.warn(util.format.apply(util, args));
    });
    wtf.setLogger("error", (...args: any[]) => {
        logger.error(util.format.apply(util, args));
    });

    wtf.dump();
}

export function isUnderTest(): boolean {
    return typeof (global as any).it === "function";
}
