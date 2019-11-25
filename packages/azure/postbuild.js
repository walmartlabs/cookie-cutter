const fs = require("fs");
const path = require("path");

const dstPath = path.join("dist", "resources");
if (!fs.existsSync(dstPath)) {
    fs.mkdirSync(path.join("dist", "resources"));
}

const names = ["bulkInsertSproc.js", "upsertSproc.js"];
for (const n of names) {
    const src = path.join("src", "resources", n);
    const dst = path.join("dist", "resources", n);
    if (fs.existsSync(dst)) {
        fs.unlinkSync(dst);
    }
    fs.copyFileSync(src, dst);
}
