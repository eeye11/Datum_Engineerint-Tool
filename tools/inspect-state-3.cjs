/*
 * Reports how drawing-state.js exposes its API, since the expected
 * `root.enggDrawingState =` marker was not found.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

console.log("=== every mention of enggDrawingState ===");

source.split("\n").forEach((line, index) => {
  if (line.includes("enggDrawingState")) {
    console.log(`${index + 1}: ${line}`);
  }
});

console.log("\n=== the last 900 characters ===");
console.log(source.slice(-900));
