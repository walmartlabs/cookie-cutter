/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    CancelablePromise,
    ConsoleLogger,
    ErrorHandlingMode,
    IDispatchContext,
    IMessage,
    sleep,
    StaticInputSource,
    timeout,
} from "@walmartlabs/cookie-cutter-core";
import * as sql from "mssql";
import { Mode, mssqlSink } from "..";

jest.setTimeout(60000); // 60 second

function getSqlEnv(): {
    server: string;
    database: string;
    username: string;
    password: string;
    connectionTimeout: number;
    requestTimeout: number;
    stream: boolean;
} {
    const server = "localhost";
    const username = "sa";
    const database = "master";
    const password = process.env.MSSQL_PASSWORD;
    const connectionTimeout = 15000;
    const requestTimeout = 15000;
    const stream = true;

    return {
        server,
        username,
        password,
        database,
        connectionTimeout,
        requestTimeout,
        stream,
    };
}

async function testClient(): Promise<sql.ConnectionPool> {
    const config = getSqlEnv();
    const pool = new sql.ConnectionPool({
        ...config,
        user: config.username,
    });
    await pool.connect();
    return pool;
}

class PartialObject {
    constructor(public id: number) {}
}

class SimpleObject {
    constructor(public id: number, public str: string) {}
}

class MessageWithObject {
    constructor(public embedded: SimpleObject) {}
}

class MessageWithSimpleArray {
    constructor(public arr: number[]) {}
}

class MessageWithArrayOfObjects {
    constructor(public arr: (SimpleObject | PartialObject)[]) {}
}

class CommandHandler {
    public onSimpleObject(msg: SimpleObject, ctx: IDispatchContext): void {
        ctx.logger.info(JSON.stringify(msg));
        ctx.publish(SimpleObject, msg);
    }

    public onMessageWithObject(msg: MessageWithObject, ctx: IDispatchContext): void {
        ctx.logger.info(JSON.stringify(msg));
        ctx.publish(MessageWithObject, msg);
    }

    public onMessageWithSimpleArray(msg: MessageWithSimpleArray, ctx: IDispatchContext): void {
        ctx.logger.info(JSON.stringify(msg));
        ctx.publish(MessageWithSimpleArray, msg);
    }

    public onMessageWithArrayOfObjects(
        msg: MessageWithArrayOfObjects,
        ctx: IDispatchContext
    ): void {
        ctx.logger.info(JSON.stringify(msg));
        ctx.publish(MessageWithArrayOfObjects, msg);
    }
}

function testApp(messages: IMessage[]): CancelablePromise<void> {
    const config = getSqlEnv();

    return Application.create()
        .input()
        .add(new StaticInputSource(messages))
        .done()
        .output()
        .published(
            mssqlSink({
                ...config,
                encrypt: true,
                mode: Mode.StoredProcedure,
            })
        )
        .done()
        .dispatch(new CommandHandler())
        .logger(new ConsoleLogger())
        .run(ErrorHandlingMode.LogAndContinue);
}

describe("Microsoft SQL", () => {
    describe("MssqlSink that saves records to an existing database", () => {
        let client: sql.ConnectionPool;
        beforeAll(async () => {
            // even though docker-compose up finished successfully there are
            // sometimes intermittent connection issues so we wait a little before
            // trying to establish a connection with the db.
            await sleep(10000);
            client = await testClient();
        });

        afterAll(async () => {
            await client.close();
        });

        async function dropFromDB(sproc: string, table?: string, type?: string): Promise<void> {
            const request = client.request();
            await request.query(`DROP PROCEDURE IF EXISTS ${sproc}`);
            if (table) {
                await request.query(`DROP TABLE IF EXISTS ${table}`);
            }
            if (type) {
                await request.query(`DROP TYPE IF EXISTS ${type}`);
            }
        }

        async function createInDB(createQueries: string[]): Promise<void> {
            const request = client.request();
            for (const query of createQueries) {
                await request.query(query);
            }
        }

        async function getTableContents(): Promise<sql.IResult<any>> {
            return await client.request().query(`SELECT * FROM TestTable`);
        }

        async function evaluateTest(messages: IMessage[], expectedResults: any[]) {
            const app = testApp(messages);
            try {
                await timeout(app, 10000);
            } catch (e) {
                app.cancel();
            } finally {
                const resultsTable = await getTableContents();
                expect(resultsTable.recordset).toMatchObject(expectedResults);
            }
        }

        it("succesfully calls a Sproc with Messages containing simple types", async () => {
            await dropFromDB(SimpleObject.name, "TestTable", "TableType");
            const createTable = `CREATE TABLE TestTable (id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${SimpleObject.name}
                @id INT,
                @str VARCHAR(50)
                AS
                INSERT INTO TestTable (id, str) VALUES (@id, @str);`;
            try {
                await createInDB([createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: SimpleObject.name,
                        payload: new SimpleObject(0, "0"),
                    },
                    {
                        type: SimpleObject.name,
                        payload: new SimpleObject(1, "1"),
                    },
                ];
                await evaluateTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(SimpleObject.name);
            }
        });

        it("succesfully calls a Sproc with Messages containing an object", async () => {
            await dropFromDB(MessageWithObject.name, "TestTable", "TableType");
            const createType = `CREATE TYPE TableType AS TABLE ( id INT, str [VARCHAR](50) )`;
            const createTable = `CREATE TABLE TestTable ( id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${MessageWithObject.name}
                @embedded TableType READONLY
                AS
                INSERT INTO TestTable (id, str) SELECT tval.id, tval.str FROM @embedded AS tval`;
            try {
                await createInDB([createType, createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: MessageWithObject.name,
                        payload: new MessageWithObject(new SimpleObject(0, "0")),
                    },
                    {
                        type: MessageWithObject.name,
                        payload: new MessageWithObject(new SimpleObject(1, "1")),
                    },
                ];
                await evaluateTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(MessageWithObject.name);
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of simple types", async () => {
            await dropFromDB(MessageWithSimpleArray.name, "TestTable", "TableType");
            const createType = `CREATE TYPE TableType AS TABLE ( id INT )`;
            const createTable = `CREATE TABLE TestTable ( id INT NOT NULL PRIMARY KEY );`;
            const createSproc = `CREATE PROCEDURE ${MessageWithSimpleArray.name}
                @arr TableType READONLY
                AS
                INSERT INTO TestTable (id) SELECT tval.id FROM @arr AS tval`;
            try {
                await createInDB([createType, createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: MessageWithSimpleArray.name,
                        payload: new MessageWithSimpleArray([0, 1]),
                    },
                ];
                await evaluateTest(messages, [{ id: 0 }, { id: 1 }]);
            } finally {
                await dropFromDB(MessageWithSimpleArray.name);
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of objects", async () => {
            await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            const createType = `CREATE TYPE TableType AS TABLE ( id INT, str [VARCHAR](50) )`;
            const createTable = `CREATE TABLE TestTable ( id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${MessageWithArrayOfObjects.name}
                @arr TableType READONLY
                AS
                INSERT INTO TestTable (id, str) SELECT tval.id, tval.str FROM @arr AS tval`;
            try {
                await createInDB([createType, createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: MessageWithArrayOfObjects.name,
                        payload: new MessageWithArrayOfObjects([
                            new SimpleObject(0, "0"),
                            new SimpleObject(1, "1"),
                        ]),
                    },
                ];
                await evaluateTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(MessageWithArrayOfObjects.name);
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of partial objects", async () => {
            await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            const createType = `CREATE TYPE TableType AS TABLE  ( id INT, str [VARCHAR](50) )`;
            const createTable = `CREATE TABLE TestTable ( id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${MessageWithArrayOfObjects.name}
                @arr TableType READONLY
                AS
                INSERT INTO TestTable (id, str) SELECT tval.id, tval.str FROM @arr AS tval`;
            try {
                await createInDB([createType, createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: MessageWithArrayOfObjects.name,
                        payload: new MessageWithArrayOfObjects([
                            new PartialObject(0),
                            new PartialObject(1),
                        ]),
                    },
                ];
                await evaluateTest(messages, [
                    { id: 0, str: null },
                    { id: 1, str: null },
                ]);
            } finally {
                await dropFromDB(MessageWithArrayOfObjects.name);
            }
        });

        it("succesfully calls a Sproc with a Message containing a large array of objects", async () => {
            await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            const createType = `CREATE TYPE TableType AS TABLE ( id INT, str [VARCHAR](50) )`;
            const createTable = `CREATE TABLE TestTable ( id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${MessageWithArrayOfObjects.name}
                @arr TableType READONLY
                AS
                INSERT INTO TestTable (id, str) SELECT tval.id, tval.str FROM @arr AS tval`;
            try {
                await createInDB([createType, createTable, createSproc]);
                const messages: IMessage[] = [
                    {
                        type: MessageWithArrayOfObjects.name,
                        payload: new MessageWithArrayOfObjects([
                            new SimpleObject(0, "0"),
                            new SimpleObject(1, "1"),
                            new SimpleObject(2, "2"),
                            new SimpleObject(3, "3"),
                            new SimpleObject(4, "4"),
                            new SimpleObject(5, "5"),
                            new SimpleObject(6, "6"),
                            new SimpleObject(7, "7"),
                            new SimpleObject(8, "8"),
                            new SimpleObject(9, "9"),
                            new SimpleObject(10, "10"),
                            new SimpleObject(11, "11"),
                            new SimpleObject(12, "12"),
                            new SimpleObject(13, "13"),
                            new SimpleObject(14, "14"),
                            new SimpleObject(15, "15"),
                            new SimpleObject(16, "16"),
                            new SimpleObject(17, "17"),
                            new SimpleObject(18, "18"),
                            new SimpleObject(19, "19"),
                            new SimpleObject(20, "20"),
                            new SimpleObject(21, "21"),
                            new SimpleObject(22, "22"),
                            new SimpleObject(23, "23"),
                            new SimpleObject(24, "24"),
                            new SimpleObject(25, "25"),
                            new SimpleObject(26, "26"),
                            new SimpleObject(27, "27"),
                            new SimpleObject(28, "28"),
                            new SimpleObject(29, "29"),
                            new SimpleObject(30, "30"),
                            new SimpleObject(31, "31"),
                            new SimpleObject(32, "32"),
                            new SimpleObject(33, "33"),
                            new SimpleObject(34, "34"),
                            new SimpleObject(35, "35"),
                            new SimpleObject(36, "36"),
                            new SimpleObject(37, "37"),
                            new SimpleObject(38, "38"),
                            new SimpleObject(39, "39"),
                            new SimpleObject(40, "40"),
                            new SimpleObject(41, "41"),
                            new SimpleObject(42, "42"),
                            new SimpleObject(43, "43"),
                            new SimpleObject(44, "44"),
                            new SimpleObject(45, "45"),
                            new SimpleObject(46, "46"),
                            new SimpleObject(47, "47"),
                            new SimpleObject(48, "48"),
                            new SimpleObject(49, "49"),
                        ]),
                    },
                ];
                await evaluateTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                    { id: 2, str: "2" },
                    { id: 3, str: "3" },
                    { id: 4, str: "4" },
                    { id: 5, str: "5" },
                    { id: 6, str: "6" },
                    { id: 7, str: "7" },
                    { id: 8, str: "8" },
                    { id: 9, str: "9" },
                    { id: 10, str: "10" },
                    { id: 11, str: "11" },
                    { id: 12, str: "12" },
                    { id: 13, str: "13" },
                    { id: 14, str: "14" },
                    { id: 15, str: "15" },
                    { id: 16, str: "16" },
                    { id: 17, str: "17" },
                    { id: 18, str: "18" },
                    { id: 19, str: "19" },
                    { id: 20, str: "20" },
                    { id: 21, str: "21" },
                    { id: 22, str: "22" },
                    { id: 23, str: "23" },
                    { id: 24, str: "24" },
                    { id: 25, str: "25" },
                    { id: 26, str: "26" },
                    { id: 27, str: "27" },
                    { id: 28, str: "28" },
                    { id: 29, str: "29" },
                    { id: 30, str: "30" },
                    { id: 31, str: "31" },
                    { id: 32, str: "32" },
                    { id: 33, str: "33" },
                    { id: 34, str: "34" },
                    { id: 35, str: "35" },
                    { id: 36, str: "36" },
                    { id: 37, str: "37" },
                    { id: 38, str: "38" },
                    { id: 39, str: "39" },
                    { id: 40, str: "40" },
                    { id: 41, str: "41" },
                    { id: 42, str: "42" },
                    { id: 43, str: "43" },
                    { id: 44, str: "44" },
                    { id: 45, str: "45" },
                    { id: 46, str: "46" },
                    { id: 47, str: "47" },
                    { id: 48, str: "48" },
                    { id: 49, str: "49" },
                ]);
            } finally {
                await dropFromDB(MessageWithArrayOfObjects.name);
            }
        });
    });
});
