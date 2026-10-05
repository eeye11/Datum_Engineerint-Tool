const fs = require("fs");
const path = "verify-sheets.mjs";
let source = fs.readFileSync(path, "utf8");

/*
 * Turn every recording of a result into a step that survives its own
 * failure, so one broken question does not hide the answers after it.
 */
source = source.replace(
  /(\n(\s*)log\(\n?\s*"([A-Za-z]+)",\n?)/g,
  (match, whole, indent, name) => `\n${indent}await step("${name}",\n`,
);

source = source.replace(
  /(\n(\s*)log\("([A-Za-z]+)", )/g,
  (match, whole, indent, name) =>
    `\n${indent}await step("${name}", async () => `,
);

source = source.replace(/^(\s*)return out;$/m, "$1return out;");

fs.writeFileSync(path, source);
console.log("rewritten");
