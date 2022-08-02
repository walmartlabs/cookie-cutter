/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IDisposable,
    IMetrics,
    IOutputSink,
    IOutputSinkGuarantees,
    IPublishedMessage,
    IRequireInitialization,
    OutputSinkConsistencyLevel,
} from "@walmartlabs/cookie-cutter-core";
import * as sql from "mssql";
import { Span, Tags, Tracer } from "opentracing";
import { isArray, isObject } from "util";
import { IMssqlConfiguration, Mode } from "./index";

export enum MsSqlMetadata {
    Schema = "mssql.schema",
}

export enum MsSqlOpenTracingTagKeys {
    MessageType = "mssql.msg_type",
    Mode = "mssql.client_mode",
    Schema = "mssql.schema",
}

enum MssqlMetrics {
    ExecuteQuery = "cookie_cutter.mssql_sink.execute_query",
    ExecuteSproc = "cookie_cutter.mssql_sink.execute_sproc",
    CommitTransaction = "cookie_cutter.mssql_sink.commit_transaction",
}
enum MssqlMetricResults {
    Success = "success",
    Error = "error",
}

interface ITableColumn {
    readonly name: string;
    readonly type: string;
    readonly isNullable: boolean;
}

interface ITableTypeParam {
    readonly name: string;
    readonly type: string;
    readonly precision: number;
    readonly scale: number;
}

type ParamType = "Simple" | DynamicTableType;

interface ISprocDetails {
    readonly parameters: Map<string, ParamType>;
}

interface ITableDetails {
    readonly columns: Map<string, ITableColumn>;
}

class DynamicTableType extends sql.Table {
    constructor(public name: string, columns?: sql.columns) {
        super(name);
        this.name = name;
        if (columns !== undefined) {
            this.columns = columns;
        }
    }

    public addColumn(param: ITableTypeParam) {
        this.columns.add(param.name, createSqlType(param));
    }

    public addRows(value: any) {
        const errorMessage = "Array must contain only Simple Types or only Objects";
        if (isArray(value)) {
            if (isObject(value[0])) {
                for (const element of value) {
                    if (!isObject(element)) {
                        throw new Error(errorMessage);
                    }
                    const row: sql.IRow = [];
                    for (const col of this.columns) {
                        row.push(element[col.name]);
                    }
                    this.rows.add(...row);
                }
            } else if (!isArray(value[0])) {
                for (const element of value) {
                    if (isObject(element) || isArray(element)) {
                        throw new Error(errorMessage);
                    }
                    this.rows.add(element as any);
                }
            } else {
                throw new Error(errorMessage);
            }
        } else if (isObject(value)) {
            this.addRows([value]);
        } else {
            throw new Error(
                "Attempting to pass a Simple Type as value for a Table Value Parameter"
            );
        }
    }
}

const typeMap = new Map<string, any>([
    ["varchar", sql.VarChar],
    ["nvarchar", sql.NVarChar],
    ["text", sql.Text],
    ["int", sql.Int],
    ["bigint", sql.BigInt],
    ["tinyint", sql.TinyInt],
    ["smallint", sql.SmallInt],
    ["bit", sql.Bit],
    ["float", sql.Float],
    ["numeric", sql.Numeric],
    ["decimal", sql.Decimal],
    ["real", sql.Real],
    ["date", sql.Date],
    ["datetime", sql.DateTime],
    ["datetime2", sql.DateTime2],
    ["datetimeoffset", sql.DateTimeOffset],
    ["smalldatetime", sql.SmallDateTime],
    ["time", sql.Time],
    ["uniqueidentifier", sql.UniqueIdentifier],
    ["smallmoney", sql.SmallMoney],
    ["money", sql.Money],
    ["binary", sql.Binary],
    ["varbinary", sql.VarBinary],
    ["image", sql.Image],
    ["xml", sql.Xml],
    ["char", sql.Char],
    ["nchar", sql.NChar],
    ["ntext", sql.NText],
    ["tvp", sql.TVP],
    ["udt", sql.UDT],
    ["geography", sql.Geography],
    ["geometry", sql.Geometry],
    ["variant", sql.Variant],
]);

function createSqlType(param: ITableTypeParam): sql.ISqlType {
    if (param.scale > 0) {
        if (param.precision > 0) {
            return typeMap.get(param.type)(param.precision, param.scale);
        } else {
            return typeMap.get(param.type)(param.scale);
        }
    } else {
        return typeMap.get(param.type)(sql.MAX);
    }
}

export class MssqlSink
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable
{
    private connectionPool: sql.ConnectionPool;
    private sprocMap: Map<string, ISprocDetails>;
    private tableMap: Map<string, ITableDetails>;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "MsSql Client Call";

    constructor(private readonly config: IMssqlConfiguration) {
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this.tracer = ctx.tracer;
        this.metrics = ctx.metrics;
        const connectionConfig = {
            server: this.config.server,
            database: this.config.database,
            user: this.config.username,
            password: this.config.password,
            options: {
                encrypt: this.config.encrypt,
            },
            connectionTimeout: this.config.connectionTimeout,
            requestTimeout: this.config.requestTimeout,
            stream: this.config.stream,
        };
        this.connectionPool = new sql.ConnectionPool(connectionConfig);
        await this.connectionPool.connect();
        this.sprocMap = new Map<string, ISprocDetails>();
        this.tableMap = new Map<string, ITableDetails>();
    }

    private spanLogAndSetTags(
        span: Span,
        query: string,
        mode: string,
        messageType: string,
        schema: string
    ): void {
        span.log({ messageType });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-mssql");
        span.setTag(Tags.DB_INSTANCE, this.config.database);
        span.setTag(Tags.DB_TYPE, "sql");
        span.setTag(Tags.DB_USER, this.config.username);
        span.setTag(Tags.DB_STATEMENT, query);
        span.setTag(Tags.PEER_ADDRESS, this.config.server);
        span.setTag(Tags.PEER_SERVICE, "mssql");
        span.setTag(MsSqlOpenTracingTagKeys.Mode, mode);
        span.setTag(MsSqlOpenTracingTagKeys.MessageType, messageType);
        span.setTag(MsSqlOpenTracingTagKeys.Schema, schema);
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const tx = this.connectionPool.transaction();
        const mode = this.config.mode;
        let spans: Span[] = [];
        let haveUnfinishedSpans: boolean;
        try {
            if (mode === Mode.Table) {
                await tx.begin();
                const messagesByTableName: Map<string, IPublishedMessage[]> = new Map();
                for (const msg of output) {
                    const schema = msg.metadata[MsSqlMetadata.Schema] || this.config.defaultSchema;
                    const fullTableName = `${schema}.${msg.message.type}`;
                    if (!messagesByTableName.has(fullTableName)) {
                        messagesByTableName.set(fullTableName, []);
                    }
                    messagesByTableName.get(fullTableName).push(msg);
                }
                for (const [fullTableName, messages] of messagesByTableName) {
                    let hasTableInfo = false;
                    let tableDetails: ITableDetails;
                    let table: sql.Table;
                    let insertQueryString = "";
                    let schema = "";
                    spans = [];
                    for (const pubMsg of messages) {
                        const span = this.tracer.startSpan(this.spanOperationName, {
                            childOf: pubMsg.spanContext,
                        });
                        haveUnfinishedSpans = true;
                        if (!hasTableInfo) {
                            schema =
                                pubMsg.metadata[MsSqlMetadata.Schema] || this.config.defaultSchema;
                            tableDetails = await this.getTableDetails(
                                schema,
                                pubMsg.message.type,
                                tx.request()
                            );
                            table = new sql.Table(fullTableName);
                            table.create = false;
                            const columns = tableDetails.columns;
                            const columnNames: string[] = [];
                            for (const [name, column] of columns) {
                                table.columns.add(name, typeMap.get(column.type), {
                                    nullable: column.isNullable,
                                });
                                columnNames.push(name);
                            }
                            const columnList = columnNames.join(", ");
                            const valuesList = columnNames.map((col) => "@" + col).join(", ");
                            insertQueryString = `INSERT INTO ${fullTableName} (${columnList}) VALUES (${valuesList})`;
                            hasTableInfo = true;
                        }
                        this.spanLogAndSetTags(
                            span,
                            insertQueryString,
                            "Table",
                            pubMsg.message.type,
                            schema
                        );
                        spans.push(span);
                        const row: sql.IRow = [];
                        table.columns.forEach((column) => {
                            row.push(pubMsg.message.payload[column.name]);
                        });
                        table.rows.add(...row);
                    }
                    const request = tx.request();
                    await request.bulk(table);
                    this.metrics.increment(MssqlMetrics.ExecuteQuery, messages.length, {
                        server: this.config.server,
                        database: this.config.database,
                    });
                    spans.map((span) => span.finish());
                    haveUnfinishedSpans = false;
                }
                await tx.commit();
                this.metrics.increment(MssqlMetrics.CommitTransaction, {
                    server: this.config.server,
                    database: this.config.database,
                    result: MssqlMetricResults.Success,
                });
            } else if (mode === Mode.StoredProcedure) {
                await tx.begin();
                for (const pubMsg of output) {
                    const span = this.tracer.startSpan(this.spanOperationName, {
                        childOf: pubMsg.spanContext,
                    });
                    haveUnfinishedSpans = true;
                    const schema =
                        pubMsg.metadata[MsSqlMetadata.Schema] || this.config.defaultSchema;
                    const sprocDetails: ISprocDetails = await this.getSprocDetails(
                        schema,
                        pubMsg.message.type,
                        tx.request()
                    );
                    const request = tx.request();
                    this.populateRequest(request, sprocDetails, pubMsg.message.payload);
                    this.spanLogAndSetTags(
                        span,
                        undefined,
                        "StoredProcedure",
                        pubMsg.message.type,
                        schema
                    );
                    spans.push(span);
                    await request.execute(`${schema}.${pubMsg.message.type}`);
                    this.metrics.increment(MssqlMetrics.ExecuteSproc, {
                        server: this.config.server,
                        database: this.config.database,
                    });
                    spans.map((span) => span.finish());
                    haveUnfinishedSpans = false;
                }
                await tx.commit();
                this.metrics.increment(MssqlMetrics.CommitTransaction, {
                    server: this.config.server,
                    database: this.config.database,
                    result: MssqlMetricResults.Success,
                });
            }
        } catch (e) {
            spans.map((span) => failSpan(span, e));
            this.metrics.increment(MssqlMetrics.CommitTransaction, {
                server: this.config.server,
                database: this.config.database,
                result: MssqlMetricResults.Error,
            });
            try {
                await tx.rollback();
            } catch {
                // ignore this error, rolling back a transaction on error
                // can fail due to various reasons and we want to ensure
                // that the correct error is bubbled up and not a generic
                // "failed to rollback transaction" error
            }
            throw e;
        } finally {
            if (spans.length > 0 && haveUnfinishedSpans) {
                spans.map((span) => span.finish());
            }
        }
    }

    public async dispose(): Promise<void> {
        if (this.connectionPool) {
            await this.connectionPool.close();
        }
    }

    public get guarantees(): IOutputSinkGuarantees {
        return {
            consistency: OutputSinkConsistencyLevel.Atomic,
            idempotent: false,
        };
    }

    private async getSprocDetailsFromSql(
        schema: string,
        sprocName: string,
        request: sql.Request
    ): Promise<ISprocDetails> {
        const rawSprocDetails = await request.query(this.getSprocSqlQuery(schema, sprocName));
        // rowsAffected is the number of parameters for the requested sproc
        if (rawSprocDetails.rowsAffected[0] === 0) {
            throw new Error(`Stored Procedure ${schema}.${sprocName} not found`);
        }
        const recordsetEntries = rawSprocDetails.recordset;
        const sprocDetails: ISprocDetails = { parameters: new Map<string, ParamType>() };
        for (const entry of recordsetEntries) {
            if (entry.sprocParamType === null) {
                sprocDetails.parameters.set(entry.sprocParamName.substr(1), "Simple");
            } else {
                const sprocParamName = entry.sprocParamName.substr(1); // strip out the '@' since it's automatically added back later
                let tableType: DynamicTableType = sprocDetails.parameters.get(
                    sprocParamName
                ) as DynamicTableType;
                if (!tableType) {
                    const sprocParamType = entry.sprocParamType;
                    tableType = new DynamicTableType(sprocParamType);
                    sprocDetails.parameters.set(sprocParamName, tableType);
                }
                tableType.addColumn(entry);
            }
        }
        return sprocDetails;
    }

    private async getSprocDetails(
        schema: string,
        sprocName: string,
        request: sql.Request
    ): Promise<ISprocDetails> {
        let sprocDetails: ISprocDetails = this.sprocMap.get(`${schema}.${sprocName}`);
        if (!sprocDetails) {
            sprocDetails = await this.getSprocDetailsFromSql(schema, sprocName, request);
            this.sprocMap.set(`${schema}.${sprocName}`, sprocDetails);
        }
        return sprocDetails;
    }

    private populateRequest(
        request: sql.Request,
        sprocDetails: ISprocDetails,
        messagePayload: any
    ): void {
        const keys = Object.keys(messagePayload);
        for (const key of keys) {
            const tableType: ParamType = sprocDetails.parameters.get(key);
            if (tableType === "Simple") {
                request.input(key, messagePayload[key]);
            } else if (tableType === undefined) {
                throw new Error(
                    `Payload key: ${key} does not match any parameter in the Stored Procedure`
                );
            } else {
                const tempTableType: DynamicTableType = new DynamicTableType(
                    tableType.name,
                    tableType.columns
                );
                tempTableType.addRows(messagePayload[key]);
                request.input(key, tempTableType);
            }
        }
    }

    private getSprocSqlQuery(schema: string, sprocName: string): string {
        return `
        SELECT
            par.name as sprocParamName,
            tt.name as sprocParamType,
            col.name as [name],
            type_name(COALESCE(col.system_type_id, par.system_type_id)) as type,
            COALESCE(col.precision, par.precision) as precision,
            COALESCE(col.scale, par.scale) as scale
        FROM sys.parameters AS par
        LEFT JOIN sys.table_types as tt ON tt.name = type_name(par.user_type_id)
        LEFT JOIN sys.columns as col ON col.object_id = tt.type_table_object_id
        WHERE
            par.object_id = object_id('${schema}.${sprocName}');`;
    }

    private async getTableDetailsFromSql(
        schema: string,
        tableName: string,
        request: sql.Request
    ): Promise<ITableDetails> {
        const rawTableDetails = await request.query(this.getTableSqlQuery(schema, tableName));
        // rowsAffected is the number of columns for the requested table
        if (rawTableDetails.rowsAffected[0] === 0) {
            throw new Error(`Table ${schema}.${tableName} not found`);
        }
        const recordsetEntries = rawTableDetails.recordset;
        const tableDetails: ITableDetails = { columns: new Map<string, ITableColumn>() };
        for (const entry of recordsetEntries) {
            tableDetails.columns.set(entry.name as string, entry as ITableColumn);
        }
        return tableDetails;
    }

    private async getTableDetails(
        schema: string,
        tableName: string,
        request: sql.Request
    ): Promise<ITableDetails> {
        let tableDetails: ITableDetails = this.tableMap.get(`${schema}.${tableName}`);
        if (!tableDetails) {
            tableDetails = await this.getTableDetailsFromSql(schema, tableName, request);
            this.tableMap.set(`${schema}.${tableName}`, tableDetails);
        }
        return tableDetails;
    }

    private getTableSqlQuery(schema: string, tableName: string): string {
        return `
            SELECT
                c.name AS name,
                type_name(system_type_id) AS type,
                is_nullable AS isNullable
            FROM sys.columns AS c
            WHERE c.object_id = object_id('${schema}.${tableName}');
        `;
    }
}
