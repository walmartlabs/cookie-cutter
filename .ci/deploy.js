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
    const paths = [ ];
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
    const tag = getTag(version);
    const info = npm(`show ${name}`);
    let deployed = info.versions;
    if (info.error && info.error.code === "E404") {
        deployed = [];
    }

    if (deployed.filter((v) => semver.eq(v, version)).length > 0) {
        console.log(`${name}@${version} is already deployed, skipping`);
    } else {
        console.log(`publishing ${name}@${version} to ${tag}`);
        copyFileSync(join(__dirname, "..", ".yarnignore"), join(fullPath, ".yarnignore"))
        try {
            // NOTE: disabled actual publish step while testing
            // yarn(`publish --cwd="${fullPath}" --tag=${tag} --access=public --non-interactive`, false);
        } finally {
            unlinkSync(join(fullPath, ".yarnignore"));
        }
    }
}

function getTag(version) {
    // 1.1.0-beta.1 goes to next
    // 1.1.0 goes to latest
    return version.indexOf("-") > 0 ? "next" : "latest";
}

for (const project of filter(yarn("workspaces --json info"))) {
    deploy(project);
}
