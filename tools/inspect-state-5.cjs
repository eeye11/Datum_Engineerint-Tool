/*
 * Reports the exact characters around the two insertion points,
 * with line endings made visible, so the next pattern is written
 * against reality rather than against a guess.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/drawing-state.js",
  "utf8",
);

const spots = [
  ["end of the factories object", "coordinateSystem2D: (origin", 700],
  ["exports tail", "polygonVertices,", 300],
];

for (const [label, marker, length] of spots) {
  const at = source.indexOf(marker);

  console.log(`\n=== ${label} ===`);
  console.log(at === -1 ? "(absent)" : source.slice(at, at + length));
  console.log("--- as JSON ---");
  console.log(
    at === -1 ? "(absent)" : JSON.stringify(source.slice(at, at + length)),
  );
}
