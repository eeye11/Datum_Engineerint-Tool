const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const p = path.join(projectRoot, "tools", "apply-patch.cjs");

let s = fs.readFileSync(p, "utf8");

const a = "  const occurrences = source.split(patch.find).length - 1;";

const b =
  '  const usesCrlf = source.includes("\\r\\n");\n' +
  "\n" +
  "  const toFileNewlines = (text) =>\n" +
  '    usesCrlf ? text.replace(/\\r?\\n/g, "\\r\\n") : text;\n' +
  "\n" +
  "  const find = toFileNewlines(patch.find);\n" +
  "  const replace = toFileNewlines(patch.replace);\n" +
  "\n" +
  "  const occurrences = source.split(find).length - 1;";

if (!s.includes(a)) {
  console.error("anchor missing");
  process.exit(1);
}

s = s.replace(a, b);

s = s.replace(
  "source = source.split(patch.find).join(patch.replace);",
  "source = source.split(find).join(replace);",
);

fs.writeFileSync(p, s, "utf8");

console.log("patched apply-patch.cjs");