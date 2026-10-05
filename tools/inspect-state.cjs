/*
 * Reports the exact text of the places in drawing-state.js that a
 * dimension/annotation wiring patch has to touch, so the patch can be
 * written against what is really there.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

console.log("lines:", source.split("\n").length);

for (const marker of [
  "coordinateSystem2D:",
  "function serializeDrawing",
  "function restoreDocument",
  "const typeLabel",
  "function addObject",
  "const geometryFactories",
]) {
  const at = source.indexOf(marker);

  console.log(`\n=== ${marker} (at ${at}) ===`);

  if (at === -1) {
    console.log("(absent)");
    continue;
  }

  console.log(source.slice(at, at + 480));
}
