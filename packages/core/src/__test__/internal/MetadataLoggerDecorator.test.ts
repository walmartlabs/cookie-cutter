/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { ILogger, ILoggerStructuredData, IMetadata } from "../..";
import { MetadataLoggerDecorator } from "../../internal";

describe("MetadataLoggerDecorator", () => {
    it("appends number and string metadata", () => {
        const logger: ILogger = {
            debug: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
        };
        const logMessage: string = "test";
        const data: ILoggerStructuredData = { test_data_field: "TestDataContents" };
        const err: string = "err";
        const sysTest: string = "sys.system";

        const metaToFilter: IMetadata = {
            [sysTest]: "should be filtered out",
            someObject: { field: "not empty" },
        };

        const metaToPass: IMetadata = {
            test_meta_string: "TestMetaContents",
            test_meta_number: 10,
            test_meta_date: new Date(),
        };

        const decorator = new MetadataLoggerDecorator(logger, { ...metaToPass, ...metaToFilter });
        decorator.debug(logMessage, data);
        decorator.info(logMessage, data);
        decorator.warn(logMessage);
        decorator.error(logMessage, err);

        expect(logger.debug).toHaveBeenCalledWith(logMessage, { ...data, ...metaToPass });
        expect(logger.info).toHaveBeenCalledWith(logMessage, { ...data, ...metaToPass });
        expect(logger.warn).toHaveBeenCalledWith(logMessage, metaToPass);
        expect(logger.error).toHaveBeenCalledWith(logMessage, err, metaToPass);
    });
});
