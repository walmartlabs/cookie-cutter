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
    ParallelismMode,
    sleep,
    StaticInputSource,
    timeout,
} from "@walmartlabs/cookie-cutter-core";
import * as sql from "mssql";
import { Mode, mssqlSink, MsSqlMetadata } from "..";

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

class PartialObjectWithMetadata extends PartialObject {}

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

const metadataSchema = "metadata_scheming";

class CommandHandler {
    public metadataCounter = 0;
    public onPartialObjectWithMetadata(
        msg: PartialObjectWithMetadata,
        ctx: IDispatchContext
    ): void {
        ctx.logger.info(JSON.stringify(msg));
        if (this.metadataCounter % 2 === 0) {
            ctx.publish(PartialObjectWithMetadata, msg, {
                [MsSqlMetadata.Schema]: metadataSchema,
            });
        } else {
            ctx.publish(PartialObjectWithMetadata, msg);
        }
        this.metadataCounter++;
    }

    public onPartialObject(msg: PartialObject, ctx: IDispatchContext): void {
        ctx.logger.info(JSON.stringify(msg));
        ctx.publish(PartialObject, msg);
    }

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

function testApp(
    messages: IMessage[],
    schema: string,
    mode: Mode,
    parrallelism: ParallelismMode
): CancelablePromise<void> {
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
                mode,
                defaultSchema: schema,
            })
        )
        .done()
        .dispatch(new CommandHandler())
        .logger(new ConsoleLogger())
        .run(ErrorHandlingMode.LogAndContinue, parrallelism);
}

function returnMixedTableInput(num: number): IMessage[] {
    const arr: IMessage[] = [];
    for (let ii = 0; ii < num; ii++) {
        arr.push({ type: SimpleObject.name, payload: new SimpleObject(ii, `${ii}`) });
        arr.push({ type: PartialObject.name, payload: new PartialObject(ii) });
    }
    return arr;
}

function expectedSimple(num: number): { id: number; str: string }[] {
    const arr: { id: number; str: string }[] = [];
    for (let ii = 0; ii < num; ii++) {
        arr.push({ id: ii, str: `${ii}` });
    }
    return arr;
}

function expectedPartial(num: number): { id: number }[] {
    const arr: { id: number }[] = [];
    for (let ii = 0; ii < num; ii++) {
        arr.push({ id: ii });
    }
    return arr;
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

        async function dropFromDB(
            sproc: string,
            table?: string,
            type?: string,
            schema?: string
        ): Promise<void> {
            const request = client.request();
            if (sproc) {
                await request.query(`DROP PROCEDURE IF EXISTS ${sproc}`);
            }
            if (table) {
                await request.query(`DROP TABLE IF EXISTS ${table}`);
            }
            if (type) {
                await request.query(`DROP TYPE IF EXISTS ${type}`);
            }
            if (schema) {
                await request.query(`DROP SCHEMA IF EXISTS ${schema}`);
            }
        }

        async function createInDB(createQueries: string[]): Promise<void> {
            const request = client.request();
            for (const query of createQueries) {
                await request.query(query);
            }
        }

        async function getTableContents(
            schema: string,
            tableName: string
        ): Promise<sql.IResult<any>> {
            const name = schema ? `${schema}.${tableName}` : tableName;
            return await client.request().query(`SELECT * FROM ${name}`);
        }

        async function evaluateSprocTest(
            messages: IMessage[],
            expectedResults: any[],
            schema?: string
        ) {
            const app = testApp(messages, schema, Mode.StoredProcedure, ParallelismMode.Serial);
            try {
                await timeout(app, 10000);
            } catch (e) {
                app.cancel();
            } finally {
                const resultsTable = await getTableContents(schema, "TestTable");
                expect(resultsTable.recordset).toMatchObject(expectedResults);
            }
        }

        async function evaluateTableTest(
            mixedMessages: IMessage[],
            expectedResultsSimple: any[],
            expectedResultsPartial: any[],
            schema?: string
        ) {
            const app = testApp(mixedMessages, schema, Mode.Table, ParallelismMode.Concurrent);
            try {
                await timeout(app, 10000);
            } catch (e) {
                app.cancel();
            } finally {
                const resultsTableSimple = await getTableContents(schema, SimpleObject.name);
                const resultsTablePartial = await getTableContents(schema, PartialObject.name);
                expect(resultsTableSimple.recordset).toMatchObject(expectedResultsSimple);
                expect(resultsTablePartial.recordset).toMatchObject(expectedResultsPartial);
            }
        }

        it("successfully writes to Tables with non-default schema", async () => {
            const schema = "scheming_table";
            const createSchema = `CREATE SCHEMA ${schema};`;
            const createSimpleTable = `CREATE TABLE ${schema}.${SimpleObject.name} (id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createPartialTable = `CREATE TABLE ${schema}.${PartialObject.name} (id INT NOT NULL PRIMARY KEY);`;
            try {
                await createInDB([createSchema, createSimpleTable, createPartialTable]);
                const num = 10;
                const messages: IMessage[] = returnMixedTableInput(num);
                await evaluateTableTest(
                    messages,
                    expectedSimple(num),
                    expectedPartial(num),
                    schema
                );
            } finally {
                await dropFromDB(undefined, `${schema}.${SimpleObject.name}`);
                await dropFromDB(undefined, `${schema}.${PartialObject.name}`, undefined, schema);
            }
        });

        it("successfully writes to Tables with default schema", async () => {
            const createSimpleTable = `CREATE TABLE ${SimpleObject.name} (id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createPartialTable = `CREATE TABLE ${PartialObject.name} (id INT NOT NULL PRIMARY KEY);`;
            try {
                await createInDB([createSimpleTable, createPartialTable]);
                const num = 10;
                const messages: IMessage[] = returnMixedTableInput(num);
                await evaluateTableTest(messages, expectedSimple(num), expectedPartial(num));
            } finally {
                await dropFromDB(undefined, SimpleObject.name);
                await dropFromDB(undefined, PartialObject.name);
            }
        });

        it("succesfully writes to Tables with schemas provided by default value and message metadata", async () => {
            const createSchema = `CREATE SCHEMA ${metadataSchema};`;
            const createDefaultTable = `CREATE TABLE ${PartialObjectWithMetadata.name} (id INT NOT NULL PRIMARY KEY);`;
            const createMetadataTable = `CREATE TABLE ${metadataSchema}.${PartialObjectWithMetadata.name} (id INT NOT NULL PRIMARY KEY);`;
            try {
                await createInDB([createSchema, createDefaultTable, createMetadataTable]);
                const messages: IMessage[] = [
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(0),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(1),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(2),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(3),
                    },
                ];
                const app = testApp(messages, "dbo", Mode.Table, ParallelismMode.Concurrent);
                try {
                    await timeout(app, 10000);
                } catch (e) {
                    app.cancel();
                } finally {
                    const resultsDefaultTable = await getTableContents(
                        "dbo",
                        PartialObjectWithMetadata.name
                    );
                    const resultsMetadataTable = await getTableContents(
                        metadataSchema,
                        PartialObjectWithMetadata.name
                    );
                    expect(resultsDefaultTable.recordset).toMatchObject([{ id: 1 }, { id: 3 }]);
                    expect(resultsMetadataTable.recordset).toMatchObject([{ id: 0 }, { id: 2 }]);
                }
            } finally {
                await dropFromDB(undefined, PartialObjectWithMetadata.name);
                await dropFromDB(
                    undefined,
                    `${metadataSchema}.${PartialObjectWithMetadata.name}`,
                    undefined,
                    metadataSchema
                );
            }
        });

        it("succesfully calls Sprocs with schema provided by default value and message metadata", async () => {
            const createSchema = `CREATE SCHEMA ${metadataSchema};`;
            const createDefaultTable = `CREATE TABLE TestTable (id INT NOT NULL PRIMARY KEY);`;
            const createMetadataTable = `CREATE TABLE ${metadataSchema}.TestTable (id INT NOT NULL PRIMARY KEY);`;
            const createDefaultSproc = `CREATE PROCEDURE ${PartialObjectWithMetadata.name}
                @id INT
                AS
                INSERT INTO TestTable (id) VALUES (@id);`;
            const createMetadataSproc = `CREATE PROCEDURE ${metadataSchema}.${PartialObjectWithMetadata.name}
                @id INT
                AS
                INSERT INTO TestTable (id) VALUES (@id);`;
            try {
                await createInDB([
                    createSchema,
                    createDefaultTable,
                    createMetadataTable,
                    createDefaultSproc,
                    createMetadataSproc,
                ]);
                const messages: IMessage[] = [
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(0),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(1),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(2),
                    },
                    {
                        type: PartialObjectWithMetadata.name,
                        payload: new PartialObjectWithMetadata(3),
                    },
                ];
                const app = testApp(messages, "dbo", Mode.StoredProcedure, ParallelismMode.Serial);
                try {
                    await timeout(app, 10000);
                } catch (e) {
                    app.cancel();
                } finally {
                    const resultsDefaultTable = await getTableContents("dbo", "TestTable");
                    const resultsMetadataTable = await getTableContents(
                        metadataSchema,
                        "TestTable"
                    );
                    expect(resultsDefaultTable.recordset).toMatchObject([{ id: 1 }, { id: 3 }]);
                    expect(resultsMetadataTable.recordset).toMatchObject([{ id: 0 }, { id: 2 }]);
                }
            } finally {
                await dropFromDB(PartialObjectWithMetadata.name, "TestTable");
                await dropFromDB(
                    `${metadataSchema}.${PartialObjectWithMetadata.name}`,
                    `${metadataSchema}.TestTable`,
                    undefined,
                    metadataSchema
                );
            }
        });

        it("succesfully calls a Sproc with Messages containing simple types", async () => {
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
                await evaluateSprocTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(SimpleObject.name, "TestTable");
            }
        });

        it("succesfully calls a Sproc with Messages containing simple types with non-default schema", async () => {
            const schema = "scheming_sproc";
            const createSchema = `CREATE SCHEMA ${schema};`;
            const createTable = `CREATE TABLE ${schema}.TestTable (id INT NOT NULL PRIMARY KEY, str [VARCHAR](50) );`;
            const createSproc = `CREATE PROCEDURE ${schema}.${SimpleObject.name}
                @id INT,
                @str VARCHAR(50)
                AS
                INSERT INTO ${schema}.TestTable (id, str) VALUES (@id, @str);`;
            try {
                await createInDB([createSchema, createTable, createSproc]);
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
                await evaluateSprocTest(
                    messages,
                    [
                        { id: 0, str: "0" },
                        { id: 1, str: "1" },
                    ],
                    schema
                );
            } finally {
                await dropFromDB(
                    `${schema}.${SimpleObject.name}`,
                    `${schema}.TestTable`,
                    undefined,
                    schema
                );
            }
        });

        it("succesfully calls a Sproc with Messages containing an object", async () => {
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
                await evaluateSprocTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(MessageWithObject.name, "TestTable", "TableType");
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of simple types", async () => {
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
                await evaluateSprocTest(messages, [{ id: 0 }, { id: 1 }]);
            } finally {
                await dropFromDB(MessageWithSimpleArray.name, "TestTable", "TableType");
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of objects", async () => {
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
                await evaluateSprocTest(messages, [
                    { id: 0, str: "0" },
                    { id: 1, str: "1" },
                ]);
            } finally {
                await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            }
        });

        it("succesfully calls a Sproc with a Message containing an array of partial objects", async () => {
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
                await evaluateSprocTest(messages, [
                    { id: 0, str: null },
                    { id: 1, str: null },
                ]);
            } finally {
                await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            }
        });

        it("succesfully calls a Sproc with a Message containing a large array of objects", async () => {
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
                await evaluateSprocTest(messages, [
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
                await dropFromDB(MessageWithArrayOfObjects.name, "TestTable", "TableType");
            }
        });
    });
});
