/*
 * A doubled comma left by the previous patch.
 *
 * The replacement text ended with `: {}),` and the line it replaced
 * already ended with a comma, so the two made `: {}),,`. The file no
 * longer parsed at all - the whole module was dead, which is why
 * fixing it is the first thing rather than the last.
 */
const fs = require("fs");

const path = "js/engineering-drawing/drawing-state.js";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");

const before = CRLF
  ? "                : {}),,\r\n"
  : "                : {}),,\n";
const after = CRLF ? "                : {}),\r\n" : "                : {}),\n";

if (!source.includes(before)) {
  console.log("doubled comma not found");
  process.exit(1);
}

fs.writeFileSync(path, source.replace(before, after));
console.log("doubled comma removed");
