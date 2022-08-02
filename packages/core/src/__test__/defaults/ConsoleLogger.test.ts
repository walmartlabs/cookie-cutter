/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ConsoleLogger } from "../../defaults";

describe("ConsoleLogger", () => {
    const logMsg = { foo: "bar", cc: "core", file: "ConsoleLogger.test.ts", array: ["one", 2] };
    const nestedLogMsg = {
        foo: { bar: { baz: "nested_msg" } },
        cookie: { cutter: "core" },
        cc: "core",
        file: "ConsoleLogger.test.ts",
        array: ["one", { two: { foo: "bar" } }],
        maxDepth: {
            obj1: {
                obj2: {
                    obj3: { obj4: { obj5: { obj6: { obj7: "doesn't get here" } } }, key: "val" },
                },
            },
        },
    };

    // tslint:disable:no-console
    const originalLog = console.log;
    let capturedLogs = [];
    beforeAll(() => {
        // tslint:disable:no-console
        console.log = function () {
            capturedLogs.push([].slice.call(arguments));
        };
    });

    afterEach(() => {
        capturedLogs = [];
    });

    afterAll(() => {
        // tslint:disable:no-console
        console.log = originalLog;
    });

    it("logs out info msgs", () => {
        const logger = new ConsoleLogger({ maxDepth: 5 });
        logger.info("info logMsg", logMsg);
        logger.info("info nestedLogMsg", nestedLogMsg);
        const msg1 = capturedLogs[0][0];
        let [, info, msg, foo, cc, file, arr1, arr2] = msg1.split("|");
        expect(info).toBe("  INFO ");
        expect(msg).toBe(" info logMsg ");
        expect(foo).toBe(" foo=bar ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1=2");

        const msg2 = capturedLogs[1][0];
        let cookie;
        let maxDepth1;
        let maxDepth2;
        [, info, msg, foo, cookie, cc, file, arr1, arr2, maxDepth1, maxDepth2] = msg2.split("|");
        expect(info).toBe("  INFO ");
        expect(msg).toBe(" info nestedLogMsg ");
        expect(foo).toBe(" foo.bar.baz=nested_msg ");
        expect(cookie).toBe(" cookie.cutter=core ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1.two.foo=bar ");
        expect(maxDepth1).toBe(" maxDepth.obj1.obj2.obj3.obj4.obj5=[object Object] ");
        expect(maxDepth2).toBe(" maxDepth.obj1.obj2.obj3.key=val");
    });

    it("logs out debug msgs", () => {
        const logger = new ConsoleLogger({ maxDepth: 5 });
        logger.debug("debug logMsg", logMsg);
        logger.debug("debug nestedLogMsg", nestedLogMsg);
        const msg1 = capturedLogs[0][0];
        let [, debug, msg, foo, cc, file, arr1, arr2] = msg1.split("|");
        expect(debug).toBe(" DEBUG ");
        expect(msg).toBe(" debug logMsg ");
        expect(foo).toBe(" foo=bar ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1=2");

        const msg2 = capturedLogs[1][0];
        let cookie;
        let maxDepth1;
        let maxDepth2;
        [, debug, msg, foo, cookie, cc, file, arr1, arr2, maxDepth1, maxDepth2] = msg2.split("|");
        expect(debug).toBe(" DEBUG ");
        expect(msg).toBe(" debug nestedLogMsg ");
        expect(foo).toBe(" foo.bar.baz=nested_msg ");
        expect(cookie).toBe(" cookie.cutter=core ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1.two.foo=bar ");
        expect(maxDepth1).toBe(" maxDepth.obj1.obj2.obj3.obj4.obj5=[object Object] ");
        expect(maxDepth2).toBe(" maxDepth.obj1.obj2.obj3.key=val");
    });

    it("logs out warn msgs", () => {
        const logger = new ConsoleLogger({ maxDepth: 5 });
        logger.warn("warn logMsg", logMsg);
        logger.warn("warn nestedLogMsg", nestedLogMsg);
        const msg1 = capturedLogs[0][0];
        let [, warn, msg, foo, cc, file, arr1, arr2] = msg1.split("|");
        expect(warn).toBe("  WARN ");
        expect(msg).toBe(" warn logMsg ");
        expect(foo).toBe(" foo=bar ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1=2");

        const msg2 = capturedLogs[1][0];
        let cookie;
        let maxDepth1;
        let maxDepth2;
        [, warn, msg, foo, cookie, cc, file, arr1, arr2, maxDepth1, maxDepth2] = msg2.split("|");
        expect(warn).toBe("  WARN ");
        expect(msg).toBe(" warn nestedLogMsg ");
        expect(foo).toBe(" foo.bar.baz=nested_msg ");
        expect(cookie).toBe(" cookie.cutter=core ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1.two.foo=bar ");
        expect(maxDepth1).toBe(" maxDepth.obj1.obj2.obj3.obj4.obj5=[object Object] ");
        expect(maxDepth2).toBe(" maxDepth.obj1.obj2.obj3.key=val");
    });

    it("logs out error msgs", () => {
        const logger = new ConsoleLogger({ maxDepth: 5 });
        logger.error("error logMsg", "unable to get data", logMsg);
        logger.error("error nestedLogMsg", "unable to get data", nestedLogMsg);
        const msg1 = capturedLogs[0][0];
        let [, error, msg, foo, cc, file, arr1, arr2] = msg1.split("|");
        expect(error).toBe(" ERROR ");
        expect(msg).toBe(" error logMsg ");
        expect(foo).toBe(" foo=bar ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1=2");
        const errMsg1 = capturedLogs[1][0];
        expect(errMsg1).toBe("unable to get data");

        const msg2 = capturedLogs[2][0];
        let cookie;
        let maxDepth1;
        let maxDepth2;
        [, error, msg, foo, cookie, cc, file, arr1, arr2, maxDepth1, maxDepth2] = msg2.split("|");
        expect(error).toBe(" ERROR ");
        expect(msg).toBe(" error nestedLogMsg ");
        expect(foo).toBe(" foo.bar.baz=nested_msg ");
        expect(cookie).toBe(" cookie.cutter=core ");
        expect(cc).toBe(" cc=core ");
        expect(file).toBe(" file=ConsoleLogger.test.ts ");
        expect(arr1).toBe(" array.0=one ");
        expect(arr2).toBe(" array.1.two.foo=bar ");
        expect(maxDepth1).toBe(" maxDepth.obj1.obj2.obj3.obj4.obj5=[object Object] ");
        expect(maxDepth2).toBe(" maxDepth.obj1.obj2.obj3.key=val");
        const errMsg2 = capturedLogs[3][0];
        expect(errMsg2).toBe("unable to get data");
    });
});
