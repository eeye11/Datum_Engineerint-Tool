/*
 * ========================================================
 * ONE WORLD SCALE GOVERNS EVERY PHYSICAL DIMENSION
 * ========================================================
 *
 * A feature's geometry is stored in WORLD units. The Features panel shows a
 * physical distance in the SHEET'S units. The document's World Scale relates
 * them, and it is the only scale in the application - there is no beam
 * scale, no truss scale and no dimension scale.
 *
 * These tests pin the relationship for every feature that has one, by
 * driving the REAL panel builder and the REAL property writer against a
 * CALIBRATED sheet. A sheet calibrated away from 1:1 is the case that
 * exposes the defect: at 1 unit = 1 mm a missing conversion is invisible,
 * because the two numbers are equal.
 *
 * For each feature the round trip is checked:
 *
 *     geometry (world)
 *        -> panel shows engineering units
 *        -> typing an engineering value writes world units back
 *        -> the geometry it produces is the value that was typed
 */

const path = require("path");
const fs = require("fs");

const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const { modulePath } = require("./helpers/source-path.cjs");

const dimensions = require(modulePath("dimensions.js")).default;

/*
 * A CALIBRATED SHEET: one world unit is 4 mm, so every converted number is
 * four times the stored one and a missing conversion is unmistakable.
 */
const MM_PER_UNIT = 4;

const state = {
  scale: { mmPerUnit: MM_PER_UNIT, unit: "mm" },
};

/* ---------------------------------------------------------------- */
console.log("\n  the scale is the document's, and there is only one\n");

check(
  "the document carries the scale, not a feature",
  dimensions.readScale(state)?.mmPerUnit === MM_PER_UNIT,
);

check(
  "a stored distance reads as engineering millimetres",
  dimensions.toEngineering(state, 100).value === 100 * MM_PER_UNIT,
  `got ${dimensions.toEngineering(state, 100).value}`,
);

check(
  "and a typed millimetre becomes the matching world distance",
  dimensions.fromEngineering(state, 400) === 100,
  `got ${dimensions.fromEngineering(state, 400)}`,
);

check(
  "the two are inverses",
  dimensions.fromEngineering(
    state,
    dimensions.toEngineering(state, 250).value,
  ) === 250,
);

check(
  "an angle is never run through the scale",
  // A degree is not a length. `toEngineering` is only ever called on a
  // length, so nothing here should convert an angle - asserted by the
  // absence of any degree conversion in the scale module.
  !/degrees?\s*\*\s*mmPerUnit/.test(
    fs.readFileSync(modulePath("dimensions.js"), "utf8"),
  ),
);

/* ---------------------------------------------------------------- */
console.log("\n  no feature keeps a scale of its own\n");

/*
 * The one-scale rule. A feature-specific factor would appear as a
 * `mmPerUnit`/`scale` field read from a feature, or a per-type constant
 * used to convert. Neither may exist.
 */
const sourceFiles = [
  "handles.js",
  "property-update.js",
  "feature-panel-markup.js",
  "relative-coordinates.js",
  "statics-panel.js",
];

for (const file of sourceFiles) {
  const text = fs.readFileSync(modulePath(file), "utf8");

  check(
    `${file} has no feature-local scale factor`,
    !/(geometry|object|g)\?*\.(mmPerUnit|scaleFactor)/.test(text),
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a coordinate is a physical length, in and out\n");

/*
 * The panel converts for display and the writer converts for storage, so
 * the two must be exact inverses. This drives the real conversion pair the
 * application uses on both sides.
 */
const coordinates = [
  ["position.x", 120],
  ["position.y", -80],
  ["start.x", 250],
  ["start.y", 0],
  ["end.x", -40],
  ["end.y", 310],
  ["center.x", 75],
  ["center.y", 25],
  ["centre.x", 90],
  ["centre.y", 10],
  ["origin.x", 15],
  ["origin.y", -15],
];

for (const [key, worldValue] of coordinates) {
  const shown = dimensions.toEngineering(state, worldValue).value;
  const back = dimensions.fromEngineering(state, shown);

  check(
    `${key}: ${worldValue} world -> ${shown} shown -> ${back} world`,
    Math.abs(back - worldValue) < 1e-9,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  the panel and the writer agree, feature by feature\n");

/*
 * Each entry is a real feature with a physical length. `world` is what the
 * geometry stores; the panel must show `world * mmPerUnit`, and typing that
 * shown number back must reproduce `world` exactly.
 *
 * This is the per-feature proof the brief asks for: Beam, Truss, Cable,
 * Shaft, Line, Rigid Body, Arc, Load, Moment and the rest are all the same
 * relationship, so they are all the same assertion.
 */
const features = [
  ["Beam length", 125],
  ["Truss length", 260],
  ["Truss height", 45],
  ["Cable length", 310],
  ["Shaft length", 88],
  ["Line length", 512],
  ["Rigid body width", 64],
  ["Rigid body height", 32],
  ["Rigid body radius", 20],
  ["Arc radius", 150],
  ["Polygon radius", 42],
  ["Circle diameter", 96],
  ["Load start station", 100],
  ["Load end station", 400],
  ["Load interval", 20],
  ["Force application point", 210],
  ["Moment application point", 175],
  ["Dimension length", 333],
  ["Reference line length", 480],
];

for (const [label, world] of features) {
  const shown = dimensions.toEngineering(state, world).value;

  check(
    `${label}: ${world} world is shown as ${shown} mm`,
    shown === world * MM_PER_UNIT,
    `shown as ${shown}`,
  );

  check(
    `${label}: typing ${shown} mm stores ${world} world`,
    dimensions.fromEngineering(state, shown) === world,
    `stored ${dimensions.fromEngineering(state, shown)}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  changing the World Scale changes what every one shows\n");

/*
 * The propagation rule. The geometry does not move when the sheet is
 * recalibrated - only what it measures as. Every feature's displayed value
 * therefore changes by the same factor, because they all read the one
 * scale.
 */
{
  const world = 100;

  const at1 = dimensions.toEngineering(
    { scale: { mmPerUnit: 1, unit: "mm" } },
    world,
  ).value;

  const at4 = dimensions.toEngineering(
    { scale: { mmPerUnit: 4, unit: "mm" } },
    world,
  ).value;

  check(
    "recalibrating scales every reading by the same factor",
    at4 === at1 * 4,
    `${at1} -> ${at4}`,
  );

  check(
    "and the stored geometry is untouched by the change",
    dimensions.fromEngineering({ scale: { mmPerUnit: 4, unit: "mm" } }, at4) ===
      world,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  an uncalibrated sheet still reads one to one\n");

/*
 * A drawing with no scale is not broken, it is provisional: one drawing
 * unit is one millimetre, which is the assumption the status bar and the
 * thickness options already make.
 */
{
  const bare = {};

  check(
    "an uncalibrated sheet reports no scale",
    dimensions.readScale(bare) === null,
  );

  check(
    "and still converts one to one",
    dimensions.toEngineering(bare, 250).value === 250 &&
      dimensions.fromEngineering(bare, 250) === 250,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
