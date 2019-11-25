/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import k8s = require("@kubernetes/client-node");
import {
    Application,
    CancelablePromise,
    ConsoleLogger,
    ErrorHandlingMode,
    IDispatchContext,
} from "@walmartlabs/cookie-cutter-core";
import * as fs from "fs";
import * as path from "path";
import * as rp from "request-promise-native";
import {
    IK8sAdmissionReviewResponse,
    k8sAdmissionControllerSource,
    K8sAdmissionReviewRequest,
} from "..";

function testApp(handler: any, emptyCreds?: boolean): CancelablePromise<void> {
    const privateKey = emptyCreds
        ? ""
        : fs.readFileSync(path.join(__dirname, "webhook-server-tls.key"), "utf-8");
    const cert = emptyCreds
        ? ""
        : fs.readFileSync(path.join(__dirname, "webhook-server-tls.crt"), "utf-8");
    return Application.create()
        .logger(new ConsoleLogger())
        .input()
        .add(
            k8sAdmissionControllerSource({
                port: 8443,
                privateKey,
                cert,
                requestPaths: ["/mutate"],
            })
        )
        .done()
        .dispatch(handler)
        .run(ErrorHandlingMode.LogAndContinue);
}

describe("KubernetesAdmissionControllerSource", () => {
    const testResource: k8s.V1Deployment = {
        apiVersion: "deployment/v1",
        kind: "Deployment",
        metadata: new k8s.V1ObjectMeta(),
        spec: {
            minReadySeconds: 0,
            paused: false,
            progressDeadlineSeconds: 0,
            replicas: 1,
            revisionHistoryLimit: 0,
            selector: new k8s.V1LabelSelector(),
            strategy: new k8s.V1DeploymentStrategy(),
            template: new k8s.V1PodTemplateSpec(),
        },
        status: new k8s.V1DeploymentStatus(),
    };
    const testUid = "testUID";
    const testRequestBody = {
        apiVersion: "admission.k8s.io/v1beta1",
        kind: "AdmissionReview",
        request: {
            uid: testUid,
            name: "my-deployment",
            namespace: "my-namespace",
            operation: "UPDATE",
            object: testResource,
            dryRun: false,
        },
    };

    it("serves incoming https admission review post request that allows request", async () => {
        const app = testApp({
            onK8sAdmissionReviewRequest: async (
                _: K8sAdmissionReviewRequest,
                __: IDispatchContext
            ): Promise<IK8sAdmissionReviewResponse> => {
                return { allowed: true };
            },
        });
        try {
            const resp = await rp("https://127.0.0.1:8443/mutate", {
                method: "POST",
                rejectUnauthorized: false,
                body: testRequestBody,
                json: true,
            });
            expect(resp).toMatchObject({ response: { allowed: true, uid: testUid } });
        } finally {
            app.cancel();
            await app;
        }
    });

    it("serves incoming https admission review post request that denies request with a status", async () => {
        const app = testApp({
            onK8sAdmissionReviewRequest: async (
                _: K8sAdmissionReviewRequest,
                __: IDispatchContext
            ): Promise<IK8sAdmissionReviewResponse> => {
                return { allowed: false, status: { code: 400, message: "invalid request" } };
            },
        });
        try {
            const resp = await rp("https://127.0.0.1:8443/mutate", {
                method: "POST",
                rejectUnauthorized: false,
                body: testRequestBody,
                json: true,
            });
            expect(resp).toMatchObject({
                response: {
                    allowed: false,
                    uid: testUid,
                    status: { code: 400, message: "invalid request" },
                },
            });
        } finally {
            app.cancel();
            await app;
        }
    });

    it("serves incoming https admission review post request that mutates resource", async () => {
        const app = testApp({
            onK8sAdmissionReviewRequest: async (
                msg: K8sAdmissionReviewRequest,
                __: IDispatchContext
            ): Promise<IK8sAdmissionReviewResponse> => {
                const mutation: k8s.V1Deployment = msg.request.object;
                mutation.metadata = new k8s.V1ObjectMeta();
                mutation.metadata.annotations = { new_annotation: "new" };
                mutation.spec.replicas = 2;
                delete mutation.spec.revisionHistoryLimit;
                return { allowed: true, modifiedObject: mutation };
            },
        });
        try {
            const resp = await rp("https://127.0.0.1:8443/mutate", {
                method: "POST",
                rejectUnauthorized: false,
                body: testRequestBody,
                json: true,
            });
            expect(resp).toMatchObject({
                response: {
                    allowed: true,
                    uid: testUid,
                    patchType: "JSONPatch",
                    patch: expect.stringMatching(".*"),
                },
            });
            const expJsonPatch = [
                { op: "remove", path: "/spec/revisionHistoryLimit" },
                { op: "replace", path: "/spec/replicas", value: 2 },
                { op: "add", path: "/metadata/annotations", value: { new_annotation: "new" } },
            ];
            const parsedJsonPatch = JSON.parse(
                Buffer.from(resp.response.patch, "base64").toString()
            );
            expect(parsedJsonPatch).toMatchObject(expJsonPatch);
        } finally {
            app.cancel();
            await app;
        }
    });

    it("throws when an empty key or cert is passed to the Https Server", async () => {
        let error;
        try {
            await testApp(
                {
                    onK8sAdmissionReviewRequest: async (
                        _: K8sAdmissionReviewRequest,
                        __: IDispatchContext
                    ): Promise<IK8sAdmissionReviewResponse> => {
                        return { allowed: true };
                    },
                },
                true
            );
        } catch (e) {
            error = e;
        }
        expect(error).toMatchObject(
            new Error("test failed: init: false, run: false, dispose: true")
        );
    });
});
