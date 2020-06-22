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

export enum MsSqlOpenTracingTagKeys {
    MessageType = "mssql.msg_type",
    Mode = "mssql.client_mode",
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
                    this.rows.add(element);
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
    implements IOutputSink<IPublishedMessage>, IRequireInitialization, IDisposable {
    private connectionPool: sql.ConnectionPool;
    private sprocMap: Map<string, ISprocDetails>;
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
        };
        this.connectionPool = new sql.ConnectionPool(connectionConfig);
        await this.connectionPool.connect();
        this.sprocMap = new Map<string, ISprocDetails>();
    }

    private spanLogAndSetTags(span: Span, query: string, mode: string, messageType: string): void {
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
    }

    public async sink(output: IterableIterator<IPublishedMessage>): Promise<void> {
        const tx = this.connectionPool.transaction();
        const mode = this.config.mode;
        let span: Span;
        let haveUnfinishedSpan: boolean;
        try {
            await tx.begin();
            for (const pubMsg of output) {
                const request = tx.request();
                const keys = Object.keys(pubMsg.message.payload);
                // Using TableInsertion as default mode for backward compatibility
                span = this.tracer.startSpan(this.spanOperationName, {
                    childOf: pubMsg.spanContext,
                });
                haveUnfinishedSpan = true;
                let metricKey;
                if (mode === Mode.Table) {
                    keys.forEach((key) => request.input(key, pubMsg.message.payload[key]));
                    metricKey = MssqlMetrics.ExecuteQuery;
                    const keysList = keys.join(", ");
                    const valuesList = keys.map((key) => "@" + key).join(", ");
                    const insertQueryString = `INSERT INTO ${pubMsg.message.type} (${keysList}) VALUES (${valuesList})`;
                    this.spanLogAndSetTags(span, insertQueryString, "Table", pubMsg.message.type);
                    await request.query(insertQueryString);
                } else if (mode === Mode.StoredProcedure) {
                    const sprocDetails: ISprocDetails = await this.getSprocDetails(
                        pubMsg.message.type,
                        tx.request()
                    );
                    this.populateRequest(request, sprocDetails, pubMsg.message.payload);
                    this.spanLogAndSetTags(span, undefined, "StoredProcedure", pubMsg.message.type);
                    metricKey = MssqlMetrics.ExecuteSproc;
                    await request.execute(pubMsg.message.type);
                }
                this.metrics.increment(metricKey, {
                    server: this.config.server,
                    database: this.config.database,
                });
                span.finish();
                haveUnfinishedSpan = false;
            }
            await tx.commit();
            this.metrics.increment(MssqlMetrics.CommitTransaction, {
                server: this.config.server,
                database: this.config.database,
                result: MssqlMetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
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
            if (span && haveUnfinishedSpan) {
                span.finish();
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
        sprocName: string,
        request: sql.Request
    ): Promise<ISprocDetails> {
        const rawSprocDetails = await request.query(this.getSqlQuery(sprocName));
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

    private async getSprocDetails(sprocName: string, request: sql.Request): Promise<ISprocDetails> {
        let sprocDetails: ISprocDetails = this.sprocMap.get(sprocName);
        if (!sprocDetails) {
            sprocDetails = await this.getSprocDetailsFromSql(sprocName, request);
            this.sprocMap.set(sprocName, sprocDetails);
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

    private getSqlQuery(sprocName: string): string {
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
            par.object_id = object_id('dbo.${sprocName}');`;
    }
}
