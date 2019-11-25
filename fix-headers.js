const { readdirSync, lstatSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const LICENSE = Buffer.from(`/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

`);

function traverseDirectory(path) {
    for (const file of readdirSync(path)) {
        if (lstatSync(join(path, file)).isDirectory() && file !== "node_modules") {
            traverseDirectory(join(path, file));
        } else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
            patchHeader(join(path, file));
        }
    }
}

function patchHeader(path) {
    const buffer = readFileSync(path);
    const str = buffer.toString();
    if (str.indexOf("Copyright (c) Walmart Inc.") === -1) {
        writeFileSync(path, LICENSE, { flag: "w" });
        writeFileSync(path, buffer, { flag: "a" });
    }
}

traverseDirectory(__dirname);
