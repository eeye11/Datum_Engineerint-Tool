/*
 * Reports the exact bytes around each place a wiring patch must touch.
 * JSON.stringify so that indentation and trailing whitespace are
 * visible rather than guessed at.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

const spots = [
  ["factories tail", "coordinateSystem2D: (origin", 900],
  ["type label table", 'coordinateSystem2D: "2D', 200],
  ["exports head", "window.enggDrawingState = {", 260],
  ["exports tail", "polygonVertices,", 220],
];

for (const [label, marker, length] of spots) {
  const at = source.indexOf(marker);

  console.log(`\n=== ${label} (at ${at}) ===`);
  console.log(
    at === -1 ? "(absent)" : JSON.stringify(source.slice(at, at + length)),
  );
}
