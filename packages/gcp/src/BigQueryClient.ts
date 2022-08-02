/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BigQuery, Dataset } from "@google-cloud/bigquery";
import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IMetrics,
    IRequireInitialization,
    OpenTracingTagKeys,
    ILogger,
} from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext, Tags, Tracer } from "opentracing";
import { IBigQueryClient, IBigQueryConfiguration } from ".";

enum BigQueryMetrics {
    Put = "cookie_cutter.bigQuery_client.put",
}

enum BigQueryMetricResults {
    Success = "success",
    Error = "error",
}

export enum BigQueryOpenTracingTagKeys {
    DatasetName = "bigQuery.dataset",
    TableName = "bigQuery.table",
}

export class BigQueryClient implements IBigQueryClient, IRequireInitialization {
    private dataset: Dataset;
    private tracer: Tracer;
    private metrics: IMetrics;
    private spanOperationName: string = "BigQuery Client Call";
    private logger: ILogger;

    constructor(private readonly config: IBigQueryConfiguration) {
        const key = this.config.privateKey.split("\\n").join("\n");
        this.dataset = new BigQuery({
            projectId: this.config.projectId,
            credentials: {
                client_email: this.config.clientEmail,
                private_key: key,
            },
        }).dataset(this.config.datasetId);
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
    }

    public async initialize(context: IComponentContext): Promise<void> {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        this.logger = context.logger;
    }

    private spanLogAndSetTags(span: Span, funcName: string, dataset: string, table: string): void {
        span.log({ dataset, table });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-bigQuery");
        span.setTag(Tags.DB_INSTANCE, dataset);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(BigQueryOpenTracingTagKeys.DatasetName, dataset);
        span.setTag(BigQueryOpenTracingTagKeys.TableName, table);
    }

    public async putObject(context: SpanContext, body: any[] | any, table: string): Promise<void> {
        const datasetId = this.config.datasetId;
        const datasetTable = `${datasetId}.${table}`;
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: context });
        this.spanLogAndSetTags(span, this.putObject.name, datasetId, table);
        const rows = body instanceof Array ? body : [body];
        try {
            await this.dataset.table(table).insert(rows);
            this.metrics.increment(BigQueryMetrics.Put, {
                datasetTable,
                result: BigQueryMetricResults.Success,
            });
        } catch (e) {
            failSpan(span, e);
            this.metrics.increment(BigQueryMetrics.Put, {
                datasetTable,
                result: BigQueryMetricResults.Error,
                error: e instanceof Error ? e.message : "",
            });
            let detailedErrorMsg = e;
            if ((e as any).errors) {
                detailedErrorMsg = (e as any).errors;
            }
            this.logger.error(
                "An error occurred while inserting data into big query",
                detailedErrorMsg
            );
            throw e;
        } finally {
            span.finish();
        }
    }
}
