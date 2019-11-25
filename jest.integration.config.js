const base = require("./jest.unit.config");
base.testPathIgnorePatterns = [
  "/node_modules/",
];
base.testMatch = [
  "**/*.integration.test.ts"
],
module.exports = base;
