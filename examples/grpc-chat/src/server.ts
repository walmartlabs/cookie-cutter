/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { Application, ConsoleLogger, IDispatchContext } from "@walmartlabs/cookie-cutter-core";
import { GrpcMetadata, grpcSource, IResponseStream } from "@walmartlabs/cookie-cutter-grpc";
import * as proto from "./proto";

class ChatServer {
    private readonly members = new Map<string, IResponseStream<proto.IJoinResponse>>();

    public onJoin(msg: proto.IJoinRequest, ctx: IDispatchContext) {
        const stream = ctx.metadata<IResponseStream<proto.IJoinResponse>>(
            GrpcMetadata.ResponseStream
        );
        this.members.set(msg.userId, stream);
        ctx.logger.info(`${msg.userId} joined`);
    }

    public async onSendMessage(
        msg: proto.ISendMessageRequest,
        ctx: IDispatchContext
    ): Promise<proto.ISendMessageResponse> {
        const peer = ctx.metadata<string>(GrpcMetadata.Peer);
        let from = "";
        for (const userId of this.members.keys()) {
            if (this.members.get(userId).peer === peer) {
                from = userId;
                break;
            }
        }

        for (const userId of this.members.keys()) {
            if (userId !== from) {
                ctx.logger.info(`Send message from '${from}' to '${userId}'`);
                await this.members.get(userId).send({
                    from,
                    msg: msg.msg,
                });
            }
        }

        return {};
    }
}

Application.create()
    .input()
    .add(
        grpcSource({
            host: "0.0.0.0",
            port: 5001,
            definitions: [proto.Def],
        })
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch(new ChatServer())
    .run();
