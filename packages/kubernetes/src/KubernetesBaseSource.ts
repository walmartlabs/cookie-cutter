/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    failSpan,
    ILogger,
    IMessage,
    IMetrics,
    MessageRef,
} from "@walmartlabs/cookie-cutter-core";
import * as _ from "lodash";
import { Span, Tags, Tracer } from "opentracing";

export class K8sResourceAdded {
    constructor(public readonly resource: any) {}
}

export class K8sResourceModified {
    constructor(public readonly resource: any) {}
}

export class K8sResourceDeleted {
    constructor(public readonly resource: any) {}
}

enum K8OpenTracingTagKeys {
    MessageType = "k8.msg_type",
    MessagePhase = "k8.msg_phase",
}
enum K8Metrics {
    MsgReceived = "cookie_cutter.k8_api_consumer.input_msg_received",
    MsgProcessed = "cookie_cutter.k8_api_consumer.input_msg_processed",
}
enum K8MetricResult {
    Success = "success",
    Error = "error",
}

export class KubernetesBase {
    protected tracer: Tracer;
    protected logger: ILogger;
    protected metrics: IMetrics;
    protected currentContext: string | undefined;
    protected spanOperationName = "Processing Kubernetes API Message";

    constructor() {
        this.tracer = DefaultComponentContext.tracer;
        this.logger = DefaultComponentContext.logger;
        this.metrics = DefaultComponentContext.metrics;
    }

    private spanLogAndSetTags(span: Span, phase: string, msgType: string): void {
        span.log({ phase, msgType });
        span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_SERVER);
        span.setTag(Tags.COMPONENT, "cookie-cutter-kubernetes");
        span.setTag(Tags.PEER_HOSTNAME, this.currentContext);
        span.setTag(Tags.PEER_SERVICE, "kubernetes");
        span.setTag(K8OpenTracingTagKeys.MessagePhase, phase);
        span.setTag(K8OpenTracingTagKeys.MessageType, msgType);
    }

    protected createMsgRef(phase: string, obj: any): MessageRef | undefined {
        let msg: IMessage | undefined;
        switch (phase) {
            case "ADDED":
                msg = {
                    payload: new K8sResourceAdded(obj),
                    type: K8sResourceAdded.name,
                };
                break;
            case "MODIFIED":
                msg = {
                    payload: new K8sResourceModified(obj),
                    type: K8sResourceModified.name,
                };
                break;
            case "DELETED":
                msg = {
                    payload: new K8sResourceDeleted(obj),
                    type: K8sResourceDeleted.name,
                };
                break;
            default:
                this.logger.warn(`unexpected resource phase '${phase}'`);
        }

        if (msg) {
            this.metrics.increment(K8Metrics.MsgReceived, {
                event_type: msg.type,
            });
            const span = this.tracer.startSpan(this.spanOperationName);
            this.spanLogAndSetTags(span, phase, msg.type);

            const msgRef = new MessageRef({}, msg, span.context());
            msgRef.once("released", async (_, __, error) => {
                this.metrics.increment(K8Metrics.MsgProcessed, {
                    event_type: _.payload.type,
                    result: error ? K8MetricResult.Error : K8MetricResult.Success,
                });
                if (error) {
                    failSpan(span, error);
                }
                span.finish();
            });

            return msgRef;
        }
    }
}
