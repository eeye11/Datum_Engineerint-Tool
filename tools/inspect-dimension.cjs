/*
 * Reports the exact text around the pieces of dimension-model.js that
 * still need patching, so the patch can be written against what is
 * really there rather than against what was written.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/dimension-model.js",
  "utf8",
);

function show(label, marker, length = 420) {
  const at = source.indexOf(marker);

  console.log(`=== ${label} (at ${at}) ===`);

  if (at === -1) {
    console.log("(absent)");
    return;
  }

  console.log(JSON.stringify(source.slice(at, at + length)));
}

show("round body", "function round(");
show("angular call site", 'type === "angular"');
show("resolvePrecision", "function resolvePrecision(");
show("export block", "root.enggDimensionModel");
