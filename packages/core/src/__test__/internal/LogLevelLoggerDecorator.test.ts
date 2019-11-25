/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger, LogLevel } from "../..";
import { LogLevelLoggerDecorator } from "../../internal";

describe("LogLevelLoggerDecorator", () => {
    it("filters log messages", () => {
        const logger: ILogger = {
            debug: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
        };

        const decorator = new LogLevelLoggerDecorator(logger, LogLevel.Warn);
        decorator.debug("test");
        decorator.info("test");
        decorator.warn("test");
        decorator.error("test");

        expect(logger.debug).not.toBeCalled();
        expect(logger.info).not.toBeCalled();
        expect(logger.warn).toBeCalled();
        expect(logger.error).toBeCalled();
    });
});
