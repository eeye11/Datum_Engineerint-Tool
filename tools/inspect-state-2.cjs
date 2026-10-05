/*
 * Reports the exports of drawing-state.js and the end of the
 * geometryFactories object, so a wiring patch knows where to add to
 * them.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

/* The exports. */
const exportAt = source.indexOf("root.enggDrawingState =");

console.log("=== exports ===");
console.log(source.slice(exportAt, exportAt + 900));

/* The tail of the geometryFactories object, where a new entry goes. */
const factoriesAt = source.indexOf("const geometryFactories = {");

console.log("\n=== factories tail (searching for its close) ===");

let depth = 0;
let end = factoriesAt;

for (let i = factoriesAt; i < source.length; i += 1) {
  if (source[i] === "{") depth += 1;
  if (source[i] === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

console.log(source.slice(Math.max(0, end - 620), end));
