/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    CancelablePromise,
    ErrorHandlingMode,
    IDispatchContext,
    IRequireInitialization,
    StaticInputSource,
} from "@walmartlabs/cookie-cutter-core";
import * as AWS from "aws-sdk";
import { default as fetch } from "node-fetch";
import { IS3Client, s3Client, S3Metadata, s3Sink } from "..";

export class Increment {
    constructor(public count: number) {}
}

const s3Endpoint = "http://127.0.0.1:9000";
const accessKeyId = process.env.MINIO_ACCESS_KEY || "access_key";
const secretAccessKey = process.env.MINIO_SECRET_KEY || "secret_key";

function validateKeys(accessKeyId: string, secretAccessKey: string) {
    if (!accessKeyId) {
        throw new Error("MINIO_ACCESS_KEY env is incorrectly set");
    }
    if (!secretAccessKey) {
        throw new Error("MINIO_SECRET_KEY env is incorrectly set");
    }
}

function testApp(
    handler: any,
    msgs: any[],
    s3Endpoint: string,
    accessKeyId: string,
    secretAccessKey: string
): CancelablePromise<void> {
    validateKeys(accessKeyId, secretAccessKey);
    return Application.create()
        .input()
        .add(new StaticInputSource(msgs))
        .done()
        .dispatch(handler)
        .output()
        .published(
            s3Sink({
                defaultBucket: "testbucket",
                endpoint: s3Endpoint,
                accessKeyId,
                secretAccessKey,
                sslEnabled: false,
            })
        )
        .done()
        .run(ErrorHandlingMode.LogAndFail);
}

async function testClient(
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string
): Promise<IS3Client & IRequireInitialization> {
    validateKeys(accessKeyId, secretAccessKey);
    const client = s3Client({
        endpoint,
        accessKeyId,
        secretAccessKey,
        sslEnabled: false,
    });

    return client;
}

describe("s3Sink", () => {
    const msgs = [
        {
            type: Increment.name,
            payload: new Increment(1),
        },
        {
            type: Increment.name,
            payload: new Increment(2),
        },
    ];
    const bucket = "s3-sink-client-bucket";
    let client;
    beforeAll(async () => {
        const awsClient = new AWS.S3({
            endpoint: s3Endpoint,
            credentials: new AWS.Credentials({
                accessKeyId,
                secretAccessKey,
            }),
            sslEnabled: false,
            s3BucketEndpoint: false,
            s3ForcePathStyle: true,
        });
        const params: AWS.S3.Types.CreateBucketRequest = {
            Bucket: bucket,
        };
        client = await testClient(s3Endpoint, accessKeyId, secretAccessKey);
        await awsClient.createBucket(params).promise();
    });

    it("processes input messages and saves objects to an existing s3 compliant backend bucket", async () => {
        let key: string;
        const handlers = {
            onIncrement: async (msg: Increment, ctx: IDispatchContext): Promise<void> => {
                key = `new_key-${msg.count + 2}`;
                ctx.publish(Buffer, Buffer.from("test_payload" + msg.count), {
                    [S3Metadata.Key]: key,
                    [S3Metadata.Bucket]: bucket,
                });
            },
        };
        await testApp(handlers, msgs, s3Endpoint, accessKeyId, secretAccessKey);
        const data = await client.getObject(undefined, bucket, key);
        expect(data.toString()).toEqual(`test_payload2`);
    });

    it("processes input messages and fails to save objects to non-existent bucket", async () => {
        const handlers = {
            onIncrement: async (msg: Increment, ctx: IDispatchContext): Promise<void> => {
                const key: string = `key-${msg.count}`;
                ctx.publish(Buffer, Buffer.from("test_payload" + msg.count), {
                    [S3Metadata.Key]: key,
                    [S3Metadata.Bucket]: "invalid_bucket",
                });
            },
        };

        try {
            await testApp(handlers, msgs, s3Endpoint, accessKeyId, secretAccessKey);
            throw new Error("this should not complete successfully");
        } catch (e) {
            // expected to fail
        }
    });
});

describe("s3Client", () => {
    const s3Object = "test_blob";
    const bucket = "s3-client-bucket";
    let client;

    beforeAll(async () => {
        const awsClient = new AWS.S3({
            endpoint: s3Endpoint,
            credentials: new AWS.Credentials({
                accessKeyId,
                secretAccessKey,
            }),
            sslEnabled: false,
            s3BucketEndpoint: false,
            s3ForcePathStyle: true,
        });
        const params: AWS.S3.Types.CreateBucketRequest = {
            Bucket: bucket,
        };
        client = await testClient(s3Endpoint, accessKeyId, secretAccessKey);
        await awsClient.createBucket(params).promise();
    });

    it("saves objects to an existing s3 compliant backend bucket", async () => {
        await client.putObject(undefined, Buffer.name, Buffer.from(s3Object), bucket, "clientkey");
    });

    it("fails to save objects to non-existent bucket", async () => {
        let error: Error;
        try {
            await client.putObject(
                undefined,
                Buffer.name,
                Buffer.from(s3Object),
                "invalid_bucket",
                "clientkey"
            );
        } catch (e) {
            error = e as any;
        }
        expect(error.message).toEqual("The specified bucket does not exist");
    });

    it("gets an object from an existing s3 compliant backend bucket", async () => {
        const data = await client.getObject(undefined, bucket, "clientkey");
        expect(data.toString()).toEqual(s3Object);
    });

    it("saves objects using a multipart upload", async () => {
        const mp = await client.multipartUpload(undefined, Buffer, bucket, "multitest");
        let error: Error;
        try {
            // simulate large payloads chucks that are each over 5mb
            const part1 = "1".repeat(6000000);
            await mp.send(Buffer.from(part1));
            const part2 = "2".repeat(6000000);
            await mp.send(Buffer.from(part2));
            const part3 = "3".repeat(6000000);
            await mp.send(Buffer.from(part3));
            await mp.complete();
        } catch (e) {
            error = e as any;
        }
        expect(error).toBeUndefined();
    });

    it("generates pre-signed urls for get operations", async () => {
        await client.putObject(undefined, Buffer.name, Buffer.from(s3Object), bucket, "clientkey");
        const url = client.createPresignedReadOnlyUrl(bucket, "clientkey", 5000);
        const response = await fetch(url);
        await expect(response.text()).resolves.toBe("test_blob");
    });
});
