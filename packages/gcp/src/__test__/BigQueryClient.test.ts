/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { BigQuery } from "@google-cloud/bigquery";
import { DefaultComponentContext, NullTracerBuilder } from "@walmartlabs/cookie-cutter-core";
import { Span, SpanContext } from "opentracing";
import { bigQueryClient, IBigQueryConfiguration } from "..";

jest.mock("@google-cloud/bigquery", () => {
    return {
        BigQuery: jest.fn(),
    };
});

const MockBigQuery: jest.Mock = BigQuery as any;

describe("BigQueryClient", () => {
    const config: IBigQueryConfiguration = {
        datasetId: "dataset123",
        projectId: "myProject",
        clientEmail: "myEmail",
        privateKey: "myKey",
    };
    const context = new SpanContext();
    const span: Span = new NullTracerBuilder()
        .create()
        .startSpan("unit-test", { childOf: context });

    describe("Proceeds with expected failure", () => {
        const err = "A DEFINED VALUE";
        const content = [{ content: "CONTENTS TO BE WRITTEN" }];

        beforeEach(() => {
            MockBigQuery.mockImplementation(() => {
                return {
                    dataset: () => mockDataset,
                };
            });
            const mockDataset = {
                table: (_) => mockTable,
            };

            const mockTable = {
                insert: (_) => {
                    throw err;
                },
            };
        });

        it("rejects on error from table for put", async () => {
            const client = bigQueryClient(config);
            await client.initialize(DefaultComponentContext);
            await expect(client.putObject(span.context(), content, "myTable")).rejects.toMatch(err);
        });
    });

    describe("Proceeds with expected success", () => {
        const content = [{ content: "CONTENTS TO BE WRITTEN" }];
        beforeEach(() => {
            // tslint:disable-next-line: no-identical-functions
            MockBigQuery.mockImplementation(() => {
                return {
                    dataset: () => mockDataset,
                };
            });
            const mockDataset = {
                table: (_) => mockTable,
            };

            const mockTable = {
                insert: jest.fn(),
            };
        });

        it("performs a successful write", async () => {
            const client = bigQueryClient(config);
            await client.initialize(DefaultComponentContext);
            await expect(client.putObject(span.context(), content, "myTable")).resolves.toBe(
                undefined
            );
        });
    });
});
