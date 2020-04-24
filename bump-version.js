const glob = require("glob");
const fs = require("fs");

const newVersion = process.argv[2];
if (!newVersion) {
    console.log("please specify the new version as an argument, e.g. '1.3.0-rc.0'");
    process.exit(1);
}

let peerDepVersion = `^${newVersion}`;
if (newVersion.indexOf("-") > 0) {
    const idx = newVersion.lastIndexOf(".");
    peerDepVersion = `^${newVersion.substr(0, idx)}`;
}

console.log(`bumping to version ${newVersion}, peer dependency = ${peerDepVersion}`);

glob("**/package.json", { ignore: ["node_modules/**", "package.json"] }, (_, files) => {
    for (const file of files) {
        updatePackageLock(file);
    }
});

function updatePackageLock(path) {
    const spec = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }));
    if (spec.name.startsWith("@walmartlabs/")) {
        spec.version = newVersion;
    }

    const sections = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
    ];

    for (const section of sections) {
        if (!spec[section]) continue;
        for (const name in spec[section]) {
            if (name.startsWith("@walmartlabs/")) {
                spec[section][name] = peerDepVersion;
            }
        }
    }

    fs.writeFileSync(path, JSON.stringify(spec, undefined, 4), { options: "utf8" });
    fs.appendFileSync(path, "\n", { encoding: "utf8" });
}
