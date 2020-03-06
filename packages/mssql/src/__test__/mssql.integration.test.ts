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

function getSqlEnv(): { server: string; database: string; username: string; password: string } {
    const server = "localhost";
    const username = "sa";
    const database = "master";
    const password = process.env.MSSQL_PASSWORD;

    return {
        server,
        username,
        password,
        database,
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
    constructor(public arr: Array<SimpleObject | PartialObject>) {}
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
    });
});
