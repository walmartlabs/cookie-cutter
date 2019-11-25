import { createServer, destroyServer, getMetrics } from "./helper";

describe("HttpServer", () => {
    it("properly exposes data via http", async () => {
        const testString = "METRICS";
        const server = createServer(() => testString);
        const data = await getMetrics();
        await destroyServer(server);
        expect(data).toBe(testString);
    });
});
