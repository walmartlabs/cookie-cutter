/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    BoundedPriorityQueue,
    DefaultComponentContext,
    failSpan,
    IComponentContext,
    IInputSource,
    ILogger,
    IMessage,
    IMetrics,
    IRequireInitialization,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as asyncHandler from "express-async-handler";
import { RequestHandler } from "express-serve-static-core";
import * as jsonpatch from "fast-json-patch";
import * as https from "https";
import * as _ from "lodash";
import { Span, Tags, Tracer } from "opentracing";
import { isNullOrUndefined } from "util";
import {
    IAdmissionReviewRequest,
    IK8sAdmissionControllerSourceConfiguration,
    IK8sAdmissionReviewResponse,
    K8sAdmissionReviewRequest,
} from ".";

enum K8OpenTracingTagKeys {
    Operation = "k8.operation",
    ResourceKind = "k8.resource_kind",
    Namespace = "k8.namespace",
}

enum K8Metrics {
    AdmissionReviewReceived = "cookie_cutter.k8_api_admission_review_request.received",
    AdmissionReviewProcessed = "cookie_cutter.k8_api_admission_review_request.processed",
}
enum K8MetricResult {
    Success = "success",
    Error = "error",
}

export class KubernetesAdmissionControllerSource implements IInputSource, IRequireInitialization {
    private readonly queue: BoundedPriorityQueue<MessageRef>;
    private tracer: Tracer;
    private logger: ILogger;
    private metrics: IMetrics;
    private server: https.Server | null = null;
    private spanOperationName = "Processing Kubernetes Admission Review Request";

    constructor(private readonly config: IK8sAdmissionControllerSourceConfiguration) {
        this.queue = new BoundedPriorityQueue<MessageRef>(100);
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
    }

    private spanLogAndSetTags(span: Span, admissionRequest: IAdmissionReviewRequest): void {
        const namespace = admissionRequest.namespace;
        const operation = admissionRequest.operation;
        const resourceKind = admissionRequest.object ? admissionRequest.object.kind : undefined;
        span.log({ namespace, operation, resourceKind });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_SERVER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-kubernetes");
        span.setTag(Tags.PEER_SERVICE, "kubernetes");
        span.setTag(K8OpenTracingTagKeys.Namespace, namespace);
        span.setTag(K8OpenTracingTagKeys.Operation, operation);
        span.setTag(K8OpenTracingTagKeys.ResourceKind, resourceKind);
    }

    public async initialize(ctx: IComponentContext): Promise<void> {
        this.logger = ctx.logger;
        this.tracer = ctx.tracer;
        this.metrics = ctx.metrics;

        const app = express();
        app.use(bodyParser.json()); // for parsing application/json
        const impl: RequestHandler = async (
            req: express.Request,
            resp: express.Response,
            next: express.NextFunction
        ) => {
            const request: any = req.body.request;
            const uid: string = req.body.request.uid;
            const originalObject = _.cloneDeep(request.object);
            const admissionRequest: IAdmissionReviewRequest = {
                path: req.path,
                name: request.name,
                namespace: request.namespace,
                operation: request.operation,
                object: request.object,
                oldObject: request.oldObject,
                dryRun: request.dryRun,
            };
            const msg: IMessage = {
                payload: new K8sAdmissionReviewRequest(admissionRequest),
                type: K8sAdmissionReviewRequest.name,
            };
            this.metrics.increment(K8Metrics.AdmissionReviewReceived, {
                event_type: msg.type,
                namespace: request.namespace,
            });
            const span = this.tracer.startSpan(this.spanOperationName);
            this.spanLogAndSetTags(span, admissionRequest);

            const msgRef = new MessageRef({}, msg, span.context());
            msgRef.once(
                "released",
                async (
                    __: MessageRef,
                    handlerReturnVal: IK8sAdmissionReviewResponse,
                    error: Error | undefined
                ): Promise<void> => {
                    this.metrics.increment(K8Metrics.AdmissionReviewProcessed, {
                        event_type: msg.type,
                        namespace: request.namespace,
                        result: error ? K8MetricResult.Error : K8MetricResult.Success,
                    });
                    if (error) {
                        failSpan(span, error);
                    }
                    span.finish();

                    // expected server response format: https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/#response
                    if (error) {
                        resp.json({ response: { uid, allowed: false } });
                        next();
                        return;
                    }
                    if (!this.isValidK8sAdmissionReviewResponse(originalObject, handlerReturnVal)) {
                        resp.json({ response: { uid, allowed: true } });
                        next();
                        return;
                    }
                    const admissionReviewResp: any = {
                        response: {
                            uid,
                            allowed: handlerReturnVal.allowed,
                        },
                    };
                    if (handlerReturnVal.status) {
                        admissionReviewResp.response.status = handlerReturnVal.status;
                    }
                    if (handlerReturnVal.modifiedObject) {
                        admissionReviewResp.response.patchType = "JSONPatch";
                        const patch = jsonpatch.compare(
                            originalObject,
                            handlerReturnVal.modifiedObject
                        );
                        const jsonString = JSON.stringify(patch);
                        admissionReviewResp.response.patch =
                            Buffer.from(jsonString).toString("base64");
                    }
                    resp.json(admissionReviewResp);
                    next();
                }
            );

            if (!(await this.queue.enqueue(msgRef))) {
                await msgRef.release(
                    undefined,
                    new Error("unable to enqueue. service unavailable")
                );
            }
        };

        // setup routes
        for (const path of this.config.requestPaths) {
            app.post(path, asyncHandler(impl));
        }

        try {
            if (!this.config.privateKey || !this.config.cert) {
                throw new Error(
                    "Creating an Https Server with an empty key or empty cert is not allowed!"
                );
            }
            this.server = https.createServer(
                { key: this.config.privateKey, cert: this.config.cert },
                app
            );
        } catch (err) {
            this.logger.error("unable to create server", err);
            throw err;
        }
    }

    public async *start(): AsyncIterableIterator<MessageRef> {
        this.startHttpsServer();
        for await (const msg of this.queue.iterate()) {
            yield msg;
        }
    }

    public async stop(): Promise<void> {
        await this.abort();
        if (this.server) {
            this.server.close();
        }
    }

    private startHttpsServer() {
        if (this.server) {
            this.server.listen(this.config.port);
            this.logger.info(`Server is running on https://localhost:${this.config.port}`);
        }
    }

    private isValidK8sAdmissionReviewResponse(
        originalObject: any,
        reviewResponse: IK8sAdmissionReviewResponse
    ): boolean {
        if (isNullOrUndefined(reviewResponse.allowed)) {
            this.logger.error(
                `Handler did not return an object with "allowed" set to a boolean. Succeeding Admission Review Request.`,
                reviewResponse
            );
            return false;
        }
        if (reviewResponse.allowed && reviewResponse.status) {
            this.logger.error(
                `Handler returned an object with "allowed" set to true along with a "status" property which isn't allowed. Succeeding Admission Review Request.`,
                reviewResponse
            );
            return false;
        }
        if (reviewResponse.status && reviewResponse.modifiedObject) {
            this.logger.error(
                `Handler returned an object with "status" set and "modifiedObject" properties set which isn't allowed. Succeeding Admission Review Request.`,
                reviewResponse
            );
            return false;
        }
        if (!reviewResponse.allowed && reviewResponse.modifiedObject) {
            this.logger.error(
                `Handler returned an object with "allowed" set to false and a "modifiedObject" property set which isn't allowed. Succeeding Admission Review Request.`,
                reviewResponse
            );
            return false;
        }
        if (reviewResponse.modifiedObject) {
            const expectedKeys = Object.keys(originalObject).sort();
            const receivedKeys = Object.keys(reviewResponse.modifiedObject).sort();
            const matchingKeys = _.isEqual(expectedKeys, receivedKeys);
            if (!matchingKeys) {
                this.logger.error(
                    `Handler did not return an object with expected matching keys. Succeeding Admission Review Request.`,
                    { expectedKeys, receivedKeys }
                );
                return false;
            }
            const patch = jsonpatch.compare(originalObject, reviewResponse.modifiedObject);
            if (patch.length < 1) {
                this.logger.error(
                    `Handler received a modifiedObject but no changes were made to the original payload. Succeeding Admission Review Request.`,
                    { object: originalObject }
                );
                return false;
            }
        }
        return true;
    }

    private async abort(): Promise<void> {
        await this.queue.close();
    }
}
