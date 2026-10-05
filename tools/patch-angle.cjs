/*
 * The angle result, patched against the file's real text.
 *
 * An angle was formatted as though it were a length in an arbitrary
 * unit - "90.00" instead of "90°". The `angular` flag that tells the
 * formatter not to append a unit was not set on this path, because
 * the angle returns its own object rather than passing through the
 * shared tail where the flag lives.
 *
 * The sign is taken with Math.abs because an engineering angle
 * dimension states the angle between two lines, which is the smaller
 * one; the reflex angle is not what the reader is checking.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

const marker = "const degrees =";

const at = source.indexOf(marker);

if (at === -1) {
  console.log("angle result not found");
  process.exit(1);
}

/* Find the end of the returned object literal that follows. */
const returnAt = source.indexOf("return {", at);
let depth = 0;
let end = returnAt;

for (let i = returnAt; i < source.length; i += 1) {
  if (source[i] === "{") depth += 1;
  if (source[i] === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

const before = source.slice(at, end);

const after = `/*
     * atan2 of the determinant and the dot product gives the angle
     * with its sign, and stays correct for obtuse angles where an
     * acos of the dot alone would need its sign restored. The
     * absolute value is taken because an engineering angle dimension
     * states the angle between two lines, which is the smaller one -
     * the reflex angle is not what the reader is checking.
     */
    const degrees =
      (Math.atan2(determinant, dot) * 180) / Math.PI;

    return {
      value: Math.abs(degrees),

      /*
       * Angles are dimensionless. This flag is what stops a unit being
       * appended and what makes the degree sign appear instead, so
       * without it a right angle reads "90.00" rather than "90°".
       */
      unit: "deg",
      angular: true,
      degrees: true,
      calibrated: true,
    };`;

source = source.slice(0, at) + after + source.slice(end);

/* The now-unused helper. */
source = source.replace(
  /\n  function referenceIsReversed\(\) \{\s*\n\s*return true;\s*\n\s*\}\n/,
  "\n",
);

fs.writeFileSync(path, source);

console.log("angle result patched");
console.log(
  "removed referenceIsReversed:",
  !source.includes("referenceIsReversed"),
);
