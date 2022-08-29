/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { grpcClient } from "@walmartlabs/cookie-cutter-grpc";
import { prompt, ui } from "inquirer";
import * as proto from "./proto";

// tslint:disable-next-line:no-floating-promises
(async () => {
    const client = grpcClient<proto.IChatService>({
        endpoint: "0.0.0.0:5001",
        definition: proto.Def,
    });

    const bb = new ui.BottomBar();
    const { userId } = await prompt([
        { message: "What's your name", type: "input", name: "userId" },
    ]);

    // tslint:disable-next-line:no-floating-promises
    (async () => {
        const stream = client.join({ userId });
        for await (const item of stream) {
            bb.log.write(`${item.from} > ${item.msg}`);
        }
    })();

    while (true) {
        const { msg } = await prompt([{ message: `${userId} >`, type: "input", name: "msg" }]);
        if (msg.length === 0) {
            break;
        }
        await client.sendMessage({ msg });
    }
})();
