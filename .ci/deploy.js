const semver = require("semver");
const { execSync } = require("child_process");
const { join } = require("path");
const { copyFileSync, unlinkSync } = require("fs");

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

function npm(cmd) {
    try {
        const buffer = execSync(`npm ${cmd} --json`, { encoding: "utf-8" });
        return JSON.parse(buffer);
    } catch (e) {
        return JSON.parse(e.stdout);
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

function deploy(packagePath) {
    const fullPath = join(__filename, "..", "..", packagePath);
    const { name, version } = require(join(fullPath, "package.json"));
    const tag = version.indexOf("-") > 0 ? "next" : "latest";
    const info = npm(`show ${name}`);
    const deployed = info.error && info.error.code === "E404" ? [] : info.versions;

    if (deployed.filter((v) => semver.eq(v, version)).length > 0) {
        console.log(`${name}@${version} is already deployed, skipping`);
    } else {
        console.log(`publishing ${name}@${version} to ${tag}`);
        copyFileSync(join(__dirname, "..", ".yarnignore"), join(fullPath, ".yarnignore"));
        try {
            yarn(`publish --cwd="${fullPath}" --tag=${tag} --access=public --non-interactive`, false);
        } finally {
            unlinkSync(join(fullPath, ".yarnignore"));
        }
    }
}

console.log("npm version: ", execSync(`npm --version`, { encoding: "utf-8" }).toString());
console.log("yarn version: ", execSync(`yarn --version`, { encoding: "utf-8" }).toString());
// NOTE: `workspaces info --json` does not return a proper JSON for some versions of yarn
for (const project of filter(yarn("workspaces --json info"))) {
    deploy(project);
}
