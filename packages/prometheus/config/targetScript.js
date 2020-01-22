"use strict";
const fs = require("fs");
const ip = require("ip");
const path = require("path");
const hostIp = ip.address();
console.log(hostIp);
console.log(path.resolve(__dirname, "targets.json"));
const jsonData = [
    { 
        labels: { 
            job: "tester" 
        }, 
        targets: [
            `${hostIp}:3001`,
            `${hostIp}:3002`,
            `${hostIp}:3003`
        ]
    },
];
fs.writeFileSync(path.resolve(__dirname, "targets.json"), JSON.stringify(jsonData));