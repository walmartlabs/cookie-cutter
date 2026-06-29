const { execSync } = require("child_process");
const { join } = require("path");
const { mkdirSync, renameSync, existsSync } = require("fs");

const OUTPUT_DIR = join(__dirname, "..", "release-assets");

function yarn(cmd, parseResponse = true) {
    const buffer = execSync(`yarn ${cmd}`, { encoding: "utf-8" });
    if (parseResponse) {
        const obj = JSON.parse(buffer);
        if (obj.type === "log") {
            return JSON.parse(obj.data);
        } else {
            return obj.data;
        }
    }
}

function filter(workspace) {
    const paths = [];
    for (const item of Object.keys(workspace)) {
        if (workspace[item].location.startsWith("packages/")) {
            paths.push(workspace[item].location);
        }
    }
    return paths;
}

function safeName(name) {
    // @walmartlabs/cookie-cutter-core -> walmartlabs-cookie-cutter-core
    return name.replace(/^@/, "").replace(/\//g, "-");
}

function pack(packagePath) {
    const fullPath = join(__filename, "..", "..", packagePath);
    const { name, version } = require(join(fullPath, "package.json"));
    const outFile = join(OUTPUT_DIR, `${safeName(name)}-${version}.tgz`);

    console.log(`packing ${name}@${version} -> ${outFile}`);
    execSync(`yarn pack`, { cwd: fullPath, encoding: "utf-8" });

    const packedFile = join(fullPath, "package.tgz");
    if (!existsSync(packedFile)) {
        throw new Error(`yarn pack did not produce package.tgz in ${fullPath}`);
    }
    renameSync(packedFile, outFile);
    console.log(`  -> ${outFile}`);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

console.log("yarn version: ", execSync(`yarn --version`, { encoding: "utf-8" }).toString());

for (const project of filter(yarn("workspaces --json info"))) {
    pack(project);
}

console.log(`\nAll packages packed to ${OUTPUT_DIR}`);
