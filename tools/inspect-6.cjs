/*
 * Reports the exact bytes of the layer's pairCandidates fallback.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/measurement-core.js",
  "utf8",
);

const at = source.indexOf("const spanA = twoPointSpan(first)");

console.log(
  at === -1 ? "(absent)" : JSON.stringify(source.slice(at - 40, at + 300)),
);
