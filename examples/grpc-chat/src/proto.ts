/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IGrpcServiceDefinition } from "@walmartlabs/cookie-cutter-grpc";
import * as p from "./chat";

export import IJoinRequest = p.samples.IJoinRequest;
export import IJoinResponse = p.samples.IJoinResponse;
export import JoinRequest = p.samples.JoinRequest;
export import JoinResponse = p.samples.JoinResponse;

export import ISendMessageRequest = p.samples.ISendMessageRequest;
export import ISendMessageResponse = p.samples.ISendMessageResponse;
export import SendMessageRequest = p.samples.SendMessageRequest;
export import SendMessageResponse = p.samples.SendMessageResponse;

export interface IChatService {
    join(req: IJoinRequest): AsyncIterableIterator<IJoinResponse>;
    sendMessage(req: ISendMessageRequest): Promise<ISendMessageResponse>;
}

export const Def: IGrpcServiceDefinition = {
    join: {
        path: "/samples/Join",
        requestType: JoinRequest,
        responseType: JoinResponse,
        requestStream: false,
        responseStream: true,
    },
    sendMessage: {
        path: "/samples/SendMessage",
        requestType: SendMessageRequest,
        responseType: SendMessageResponse,
        requestStream: false,
        responseStream: false,
    },
};
