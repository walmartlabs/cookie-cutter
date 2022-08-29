/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    sleep,
} from "@walmartlabs/cookie-cutter-core";
import { grpcClient, grpcSource, IGrpcServiceDefinition } from "@walmartlabs/cookie-cutter-grpc";
import * as proto from "./rpc";

interface IEchoService {
    echo(req: proto.samples.IRequest): Promise<proto.samples.IResponse>;
}

const Def: IGrpcServiceDefinition = {
    echo: {
        path: "/samples/Echo",
        requestType: proto.samples.Request,
        responseType: proto.samples.Response,
        requestStream: false,
        responseStream: false,
    },
};

const app = Application.create()
    .input()
    .add(
        grpcSource({
            host: "0.0.0.0",
            port: 5001,
            definitions: [Def],
        })
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        onEcho: (msg: proto.samples.IRequest, ctx: IDispatchContext): proto.samples.IResponse => {
            ctx.logger.info("received request", { value: msg.value });
            return { value: msg.value };
        },
    })
    .run();

// tslint:disable-next-line:no-floating-promises
(async () => {
    const client = grpcClient<IEchoService>({
        endpoint: "0.0.0.0:5001",
        definition: Def,
    });

    for (let i = 1; i < 10; i++) {
        const response = await client.echo({ value: "hello world " + i });
        // tslint:disable:no-console
        console.log(response);
        await sleep(100);
    }

    app.cancel();
    await app;
})();
