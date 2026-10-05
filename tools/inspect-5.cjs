/*
 * Reports the exact text of pairCandidates.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/smart-dimension.js",
  "utf8",
);

const at = source.indexOf("function pairCandidates");

console.log(source.slice(at, at + 1100));
