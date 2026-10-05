/*
 * Reports whether the dimension label actually reached the file, and
 * the exact text of the typeLabel table's tail.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

console.log(
  "dimension label present:",
  source.includes('dimension: "Dimension"'),
);

const at = source.indexOf("coordinate-system-2d");

console.log(
  "\ntypeLabel tail:",
  JSON.stringify(source.slice(Math.max(0, at - 40), at + 140)),
);
