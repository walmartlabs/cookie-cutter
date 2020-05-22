/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as crypto from "crypto";
import * as fs from "fs";
import { Span, Tags } from "opentracing";
import * as path from "path";
import { OpenTracingTagKeys } from "../model";

export * from "./AsyncPipe";
export * from "./Future";
export * from "./BoundedPriorityQueue";
export { createRetrier, createRetrierContext, IRetrier, RetrierContext } from "./retry";

export type CancelablePromise<T> = Promise<T> & { cancel(): void };

export function* iterate<T>(arr: T[]): IterableIterator<T> {
    for (const item of arr) {
        yield item;
    }
}

export function waitForPendingIO(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(() => {
            resolve();
        });
    });
}

export function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("timeout"));
        }, timeoutMs);

        promise
            .then((v) => {
                clearTimeout(timer);
                resolve(v);
            })
            .catch((e) => {
                clearTimeout(timer);
                reject(e);
            });
    });
}

export function sleep(timeMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, timeMs);
    });
}

export function prettyEventName(eventType: string): string {
    if (!eventType) {
        return "";
    }
    const index = eventType.lastIndexOf(".");
    if (index > 0) {
        return eventType.substr(index + 1);
    }

    return eventType;
}

export function getRootProjectPackageInfo(): { version: string; name: string } {
    let depth = 0;
    let file = "";
    do {
        const parts = [path.dirname(require.main.filename)];
        for (let i = 0; i < depth; i++) {
            parts.push("..");
        }
        parts.push("package.json");
        file = path.join(...parts);
        depth++;
    } while (!fs.existsSync(file) && depth < 10);

    if (fs.existsSync(file)) {
        return require(file);
    }

    return { name: "unknown", version: "0.0.0" };
}

export function failSpan(span: Span | undefined, e: any) {
    if (!span) {
        return;
    }

    if (e instanceof Error) {
        span.log({ event: "error", [OpenTracingTagKeys.ErrorObject]: e });
        span.setTag("message", e.message);
    } else {
        span.log({ event: "error", message: e });
        span.setTag("message", e);
    }
    span.setTag(Tags.ERROR, true);
}

export function generateUniqueId(
    ...values: (string | number | boolean | Date | (string | number | boolean | Date)[])[]
): string {
    const md5sum = crypto.createHash("md5");
    const update = (
        vals: (string | number | boolean | Date | (string | number | boolean | Date)[])[]
    ): void => {
        for (const val of vals) {
            switch (typeof val) {
                case "string":
                case "number":
                case "boolean":
                    md5sum.update(val.toString());
                    break;
                case "object":
                    if (val instanceof Date) {
                        md5sum.update(val.getTime().toString());
                    }
                    if (val instanceof Array) {
                        update(val);
                    }
            }
        }
    };

    update(values);
    return md5sum.digest("hex");
}
