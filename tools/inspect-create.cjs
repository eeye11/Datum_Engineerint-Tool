/*
 * Reports createGeometryObject, which decides which fields of the
 * options a feature keeps.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

const at = source.indexOf("function createGeometryObject");

console.log(source.slice(at, at + 2200));
