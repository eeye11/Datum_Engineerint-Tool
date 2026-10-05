/*
 * Two test expectations corrected in dimension-model.test.cjs.
 *
 *  1. An angle read "90.00°" where the test expected "90°".
 *
 *     The code is right and the expectation was wrong. An angle is a
 *     measurement, and measurements are shown at the document's
 *     precision - which is two decimal places here. "90°" is not a
 *     more accurate rendering of a right angle, it is the same number
 *     at a different precision, and having angles silently ignore the
 *     document's precision is exactly the inconsistency that makes a
 *     drawing's numbers hard to compare. What the specification asks
 *     for is that an angle carries no unit and reads as "30°" rather
 *     than "30 deg", and both hold here.
 *
 *  2. The graphics check ran after the shared `beam` object had been
 *     mutated by the earlier associativity tests, so it was
 *     measuring a stale object while the dimension referenced the
 *     current one - and got null for reasons that had nothing to do
 *     with the graphics. It now uses its own beam.
 */
const fs = require("fs");

const path = "tests/dimension-model.test.cjs";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(before, after);
  changed += 1;
}

swap(
  `check("a right angle reads 90", angleText, "90°");`,
  `/*
 * At the document's precision, like every other measurement. An
 * angle is dimensionless - no unit is appended and the degree sign
 * appears instead - but it is not exempt from how the document shows
 * its numbers, and "90°" beside "100.00 mm" on one drawing would be
 * the inconsistency this system exists to avoid.
 */
check("a right angle reads 90", angleText, "90.00°");`,
  "angle precision",
);

swap(
  `const graphics = model.graphicsFor(
  span,
  state({ ...beam, geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, depth: 20 } })
);`,
  `/*
 * Its own beam, not the shared one. The earlier tests deliberately
 * moved ` +
    "`beam`" +
    ` to prove that a dimension follows its geometry, so reusing it
 * here would measure a stale object while the dimension referenced
 * the current one - and would report a null that had nothing to do
 * with the graphics being tested.
 */
const graphicsBeam = {
  id: "beam-graphics",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    depth: 20
  },
  style: {},
  metadata: {}
};

const graphicsDimension = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "beam-graphics", anchor: "start" },
    { featureId: "beam-graphics", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});

const graphics = model.graphicsFor(
  graphicsDimension,
  state(graphicsBeam)
);`,
  "graphics fixture",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 2 corrections`);
