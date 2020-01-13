/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { createServer, destroyServer, getMetrics, port } from "./helper";

describe("HttpServer", () => {
    it("properly exposes data via http", async () => {
        const testString = "METRICS";
        const server = createServer(() => testString);
        const data = await getMetrics(port);
        await destroyServer(server);
        expect(data).toBe(testString);
    });
});
