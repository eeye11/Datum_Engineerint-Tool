/*
 * Reports the exact text of the two functions in dimension-model.js
 * that the last patch failed to match.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/dimension-model.js",
  "utf8",
);

for (const marker of ["function describesSameAs", "function alreadyStated"]) {
  const at = source.indexOf(marker);

  console.log(`=== ${marker} (at ${at}) ===`);
  console.log(at === -1 ? "(absent)" : source.slice(at, at + 620));
  console.log();
}
