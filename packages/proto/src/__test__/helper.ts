/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { join } from "path";
import { pbjs } from "protobufjs/cli";

export function loadTestProto(): Promise<any> {
    return new Promise((resolve, reject) => {
        pbjs.main(
            ["-t", "static-module", "-w", "commonjs", join(__dirname, "test.proto")],
            (err, output) => {
                if (err) {
                    reject(err);
                } else {
                    const _eval = require("eval");
                    const mod = _eval(output, true);
                    resolve(mod);
                }
            }
        );
    });
}
