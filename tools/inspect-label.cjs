/*
 * Reports the type-label table and the line that gives a feature its
 * name, to see why a dimension is still called "Horizontal 1".
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

const labelAt = source.indexOf('coordinateSystem2D: "2D');

console.log("=== label table ===");
console.log(
  labelAt === -1
    ? "(absent)"
    : source.slice(Math.max(0, labelAt - 60), labelAt + 300),
);

const nameAt = source.indexOf("name: options.name || typeLabel");

console.log("\n=== the name line ===");
console.log(
  nameAt === -1
    ? "(absent)"
    : source.slice(Math.max(0, nameAt - 40), nameAt + 160),
);
