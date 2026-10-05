/*
 * Reports the exact text of radialGraphics, which three patches have
 * now failed to match. Written against the file rather than from
 * memory, so the next patch can be written against what is there.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/dimension-model.js",
  "utf8",
);

const at = source.indexOf("function radialGraphics");

console.log(at === -1 ? "(absent)" : source.slice(at, at + 900));
