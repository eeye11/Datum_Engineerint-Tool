/*
 * Reports the exact text of the two places still failing, so the fix
 * can be written against what is there rather than against what was
 * written.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/dimension-model.js",
  "utf8",
);

function show(label, marker, length = 700) {
  const at = source.indexOf(marker);

  console.log(`=== ${label} (at ${at}) ===`);

  console.log(
    at === -1 ? "(absent)" : JSON.stringify(source.slice(at, at + length)),
  );
}

show("formatMeasurement value", "const rounded = round(");
show("graphicsFor", "function graphicsFor(");
