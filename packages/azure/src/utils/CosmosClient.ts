/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Constants,
    Container,
    CosmosClient as Client,
    CosmosHeaders,
    StoredProcedureDefinition,
} from "@azure/cosmos";
import {
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IDisposable,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import * as fs from "fs";
import { Agent, AgentOptions } from "https";
import { FORMAT_HTTP_HEADERS, Span, SpanContext, Tags, Tracer } from "opentracing";
import * as http from "http";
import * as path from "path";
import * as tunnel from "tunnel";
import * as url from "url";
import * as uuid from "uuid";
import { isSequenceConflict } from ".";
import { ICosmosConfiguration, ICosmosQuery, ICosmosQueryClient } from "..";
import { getCollectionInfo } from "./helpers";

export interface ICosmosWriteClient {
    upsert(
        document: any,
        partitionKey: string,
        currentSn: number,
        collectionId?: string
    ): Promise<void>;
    bulkInsert(
        documents: any[],
        partitionKey: string,
        validateSn: boolean,
        collectionId?: string
    ): Promise<void>;
}

type AgentWithOptions = http.Agent & { options?: AgentOptions };

enum CosmosMetrics {
    RUs = "cookie_cutter.cosmos_client.request_units",
    Sproc = "cookie_cutter.cosmos_client.execute_sproc",
    Query = "cookie_cutter.cosmos_client.execute_query",
}

enum CosmosMetricResults {
    Success = "success",
    Error = "error",
    ErrorSequenceConflict = "error.sequence_conflict",
}

export const RETRY_AFTER_MS = Constants.HttpHeaders.RetryAfterInMilliseconds;
export const BULK_INSERT_SPROC_ID = "bulkInsertSproc";
export const UPSERT_SPROC_ID = "upsertSproc";

const SPROCS: Map<string, string> = new Map([
    [BULK_INSERT_SPROC_ID, `../resources/${BULK_INSERT_SPROC_ID}.js`],
    [UPSERT_SPROC_ID, `../resources/${UPSERT_SPROC_ID}.js`],
]);

export class CosmosClient
    implements ICosmosQueryClient, ICosmosWriteClient, IRequireInitialization, IDisposable
{
    private metrics: IMetrics;
    private tracer: Tracer;
    private readonly client: Client;
    private readonly agent: AgentWithOptions;
    private spanOperationName = "Azure CosmosDB Client Call";

    private spInitialized: Map<string, boolean> = new Map([
        [BULK_INSERT_SPROC_ID, false],
        [UPSERT_SPROC_ID, false],
    ]);

    constructor(private readonly config: ICosmosConfiguration) {
        this.metrics = DefaultComponentContext.metrics;
        this.tracer = DefaultComponentContext.tracer;
        const requestAgentOptions: AgentOptions &
            tunnel.HttpsOverHttpsOptions &
            tunnel.HttpsOverHttpOptions = {
            keepAlive: true,
        };

        let proxy: string | undefined;
        if (process.env.HTTPS_PROXY) {
            proxy = process.env.HTTPS_PROXY;
        } else if (process.env.HTTP_PROXY) {
            proxy = process.env.HTTP_PROXY;
        }

        if (proxy) {
            const proxyUrl = url.parse(proxy);
            const port = parseInt(proxyUrl.port, 10);
            requestAgentOptions.proxy = {
                host: proxyUrl.hostname,
                port,
                headers: {},
            };

            if (proxyUrl.auth) {
                requestAgentOptions.proxy.proxyAuth = proxyUrl.auth;
            }

            this.agent =
                proxyUrl.protocol.toLowerCase() === "https:"
                    ? tunnel.httpsOverHttps(requestAgentOptions)
                    : tunnel.httpsOverHttp(requestAgentOptions);
            this.agent.options = requestAgentOptions;
        } else {
            this.agent = new Agent(requestAgentOptions);
        }

        this.client = new Client({
            endpoint: config.url,
            key: config.key,
            agent: this.agent,
        });
    }

    public async initialize(context: IComponentContext) {
        this.metrics = context.metrics;
        this.tracer = context.tracer;
        const sprocPromises: Promise<void>[] = [];
        for (const sprocID of SPROCS.keys()) {
            sprocPromises.push(this.initializeStoredProcedure(sprocID));
        }
        await Promise.all(sprocPromises);
    }

    public async dispose(): Promise<void> {
        // Proxy Tunnels don't have a destroy function
        if (this.agent.destroy !== undefined) {
            this.agent.destroy();
        }
    }

    private async container(collectionId?: string): Promise<Container> {
        return await this.client
            .database(this.config.databaseId)
            .container(collectionId ?? this.config.collectionId);
    }

    private async initializeStoredProcedure(sprocID: string, collectionId?: string): Promise<void> {
        const sprocPath = SPROCS.get(sprocID);
        if (!sprocPath) {
            throw new Error(
                `unable to find location of stored procedure - id: ${sprocID} currentPaths: ${SPROCS.values()}`
            );
        }

        const file = fs.readFileSync(path.resolve(__dirname, sprocPath));
        const sprocBody = file.toString();
        const container = await this.container(collectionId);

        const query = {
            query: "SELECT * FROM collection c WHERE c.id = @id",
            parameters: [{ name: "@id", value: sprocID }],
        };
        const queryIterator = await container.scripts.storedProcedures.query(query);
        const response = await queryIterator.fetchAll();
        if (response.resources.length === 0) {
            const newSproc: StoredProcedureDefinition = {
                id: sprocID,
                body: sprocBody,
            };
            await container.scripts.storedProcedures.create(newSproc);
        } else {
            const sproc = response.resources[0];
            if (sproc.body !== sprocBody) {
                const newSproc: StoredProcedureDefinition = {
                    id: sprocID,
                    body: sprocBody,
                };
                await container.scripts.storedProcedure(sproc.id).replace(newSproc);
            }
        }
        this.spInitialized.set(sprocID, true);
    }

    private generateMetricTags(
        result: CosmosMetricResults | undefined,
        metricTags?: IMetricTags
    ): IMetricTags {
        let tags: { [key: string]: any } = {
            collection_id: this.config.collectionId,
            database_id: this.config.databaseId,
        };
        if (result) {
            tags.result = result;
        }
        if (metricTags) {
            tags = {
                ...tags,
                ...metricTags,
            };
        }
        return tags;
    }

    private spanLogAndSetTags(span: Span, funcName: string, docId: string, query?: string): void {
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
        span.setTag(Tags.COMPONENT, "cookie-cutter-azure");
        span.setTag(Tags.DB_INSTANCE, this.config.databaseId);
        span.setTag(Tags.DB_TYPE, "AzureCosmosDB");
        span.setTag(Tags.PEER_ADDRESS, this.config.url);
        span.setTag(Tags.PEER_SERVICE, "AzureCosmosDB");
        span.setTag(Tags.DB_STATEMENT, query);
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag("document.id", docId);
    }

    private getRequestCharge(headers: CosmosHeaders) {
        if (headers) {
            const rc = headers[Constants.HttpHeaders.RequestCharge];
            return rc ? parseFloat(rc as string) : 0;
        }
        return 0;
    }

    private async executeSproc(
        sprocID: string,
        partitionKey: string,
        documents: any[],
        parameters: any[],
        collectionId?: string
    ): Promise<void> {
        const spans: Span[] = [];
        let requestCharge = 0;
        try {
            const container = await this.container(collectionId);
            if (!this.spInitialized.get(sprocID)) {
                await this.initializeStoredProcedure(sprocID, collectionId);
            }
            let docTraceId = uuid.v4();
            for (const doc of documents) {
                if (doc.trace && doc.trace instanceof SpanContext) {
                    if (doc.id) {
                        docTraceId = doc.id;
                    }
                    const docSpan = this.tracer.startSpan(
                        `Azure CosmosDB Client Execute Sproc For DocId: ${docTraceId}`,
                        { childOf: doc.trace }
                    );
                    this.spanLogAndSetTags(docSpan, sprocID, docTraceId);
                    const trace = {};
                    this.tracer.inject(docSpan, FORMAT_HTTP_HEADERS, trace);
                    doc.trace = trace;
                    spans.push(docSpan);
                }
            }
            const response = await container.scripts
                .storedProcedure(sprocID)
                .execute(partitionKey, parameters, { enableScriptLogging: true });
            requestCharge = parseFloat(response.requestCharge as any);
            this.metrics.increment(
                CosmosMetrics.Sproc,
                this.generateMetricTags(CosmosMetricResults.Success, { sproc_id: sprocID })
            );
        } catch (e) {
            requestCharge = this.getRequestCharge((e as any).headers);
            spans.map((span) => {
                failSpan(span, e);
            });
            const metricResult = isSequenceConflict(e as any)
                ? CosmosMetricResults.ErrorSequenceConflict
                : CosmosMetricResults.Error;
            this.metrics.increment(
                CosmosMetrics.Sproc,
                this.generateMetricTags(metricResult, { sproc_id: sprocID })
            );
            throw e;
        } finally {
            this.metrics.increment(
                CosmosMetrics.RUs,
                requestCharge,
                this.generateMetricTags(undefined)
            );
            spans.map((span) => {
                span.log({ [CosmosMetrics.RUs]: requestCharge });
                span.finish();
            });
        }
    }

    public async upsert(document: any, key: string, currentSn: number): Promise<void> {
        const { collectionId, partitionKey } = getCollectionInfo(key);

        await this.executeSproc(
            UPSERT_SPROC_ID,
            partitionKey,
            [document],
            [document, currentSn],
            collectionId ?? this.config.collectionId
        );
    }

    public async bulkInsert(documents: any[], key: string, validateSn: boolean): Promise<void> {
        const { collectionId, partitionKey } = getCollectionInfo(key);

        if (documents && documents.length >= 1) {
            await this.executeSproc(
                BULK_INSERT_SPROC_ID,
                partitionKey,
                documents,
                [documents, validateSn],
                collectionId ?? this.config.collectionId
            );
        }
    }

    public async query(
        spanContext: SpanContext,
        query: ICosmosQuery,
        collectionId?: string
    ): Promise<any[]> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: spanContext });
        this.spanLogAndSetTags(span, this.query.name, undefined, query.query);
        let requestCharge = 0;
        try {
            const container = await this.container(collectionId);
            const iterator = container.items.query(query, {
                populateQueryMetrics: true,
            });
            const combinedResults = [];
            while (iterator.hasMoreResults()) {
                const feedResponse = await iterator.fetchNext();
                requestCharge += parseFloat(feedResponse.requestCharge as any);
                if (feedResponse.resources) {
                    combinedResults.push(...feedResponse.resources);
                }
            }
            this.metrics.increment(
                CosmosMetrics.Query,
                this.generateMetricTags(CosmosMetricResults.Success)
            );
            return combinedResults;
        } catch (e) {
            requestCharge += this.getRequestCharge((e as any).headers);
            failSpan(span, e);
            this.metrics.increment(
                CosmosMetrics.Query,
                this.generateMetricTags(CosmosMetricResults.Error)
            );
            throw e;
        } finally {
            this.metrics.increment(
                CosmosMetrics.RUs,
                requestCharge,
                this.generateMetricTags(undefined)
            );
            span.log({ [CosmosMetrics.RUs]: requestCharge });
            span.finish();
        }
    }
}
