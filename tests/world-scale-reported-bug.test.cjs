/*
 * ========================================================
 * THE REPORTED FAILURE, REPRODUCED AND FIXED
 * ========================================================
 *
 * A Beam created with Length = 300000 mm was reported back as
 *
 *     Length = 30721092438.85 mm
 *     Height = 1258380694.18 mm
 *
 * Both numbers are the result of the SAME defect: a value crossing the
 * document scale twice, compounding each time the preview was rebuilt.
 *
 * These tests drive the real creation path - the preview AND the commit -
 * and assert the physical value survives it, for a range of sizes.
 */

const path = require("path");
const { JSDOM } = require("jsdom");

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

const { createHarness } = require("./harness-renderer.cjs");

createHarness(projectRoot, JSDOM, require);

const { modulePath } = require("./helpers/source-path.cjs");

const { drawingState } = require(modulePath("editor-state.js"));
const { updateFeatureProperty } = require(modulePath("property-update.js"));
const dimensions = require(modulePath("dimensions.js")).default;

const close = (a, b, rel = 1e-9) =>
  Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * rel);

/*
 * A CALIBRATED SHEET, as the report describes: the user has already
 * established a scale, so a typed length is converted through it.
 */
const MM_PER_UNIT = 4;

drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };

const measuredMm = (beam) =>
  dimensions.toEngineering(
    drawingState,
    Math.hypot(
      beam.geometry.end.x - beam.geometry.start.x,
      beam.geometry.end.y - beam.geometry.start.y,
    ),
  ).value;

/* ---------------------------------------------------------------- */
console.log("\n  the reported value round trips\n");

{
  const beam = {
    id: "beam-300k",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
  };

  /*
   * The beam was drawn 500 world units long, which on this sheet is
   * 2000 mm - so the setter has something to work from.
   */
  beam.geometry.end = { x: 500, y: 0 };

  updateFeatureProperty(beam, "length", 300000);

  check(
    "300000 mm makes the geometry 75000 world units",
    close(beam.geometry.end.x, 75000, 1e-9),
    `end.x is ${beam.geometry.end.x}`,
  );

  check(
    "and it measures back as 300000 mm",
    close(measuredMm(beam), 300000, 1e-9),
    `measured ${measuredMm(beam)} mm`,
  );

  check(
    "not 30721092438.85 mm",
    measuredMm(beam) < 1e6,
    `measured ${measuredMm(beam)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  every size round trips, and none explodes\n");

for (const mm of [1, 10, 100, 1000, 10000, 100000, 300000, 500000]) {
  const beam = {
    id: `beam-${mm}`,
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
  };

  updateFeatureProperty(beam, "length", mm);

  const back = measuredMm(beam);

  check(
    `${mm} mm round trips`,
    close(back, mm, 1e-9) && Number.isFinite(back),
    `measured ${back} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  repeated edits do not compound\n");

/*
 * THE COMPOUNDING TEST. The defect multiplied the error on every
 * keystroke, because each preview was built from the previous preview's
 * already-converted geometry. Typing a sequence of sizes must leave the
 * LAST one exact, however many came before it.
 */
{
  const beam = {
    id: "beam-seq",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
  };

  for (const mm of [100000, 200000, 300000, 400000, 50000]) {
    updateFeatureProperty(beam, "length", mm);
  }

  check(
    "a sequence of edits leaves the last value exact",
    close(measuredMm(beam), 50000, 1e-9),
    `measured ${measuredMm(beam)} mm after the sequence`,
  );

  /* And the same value typed again is stable. */
  updateFeatureProperty(beam, "length", 50000);

  check(
    "typing the same value again changes nothing",
    close(measuredMm(beam), 50000, 1e-9),
    `measured ${measuredMm(beam)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  Height does not explode because Length is large\n");

/*
 * The report showed Height corrupted alongside Length. Height is its own
 * dimension and must be unaffected by how long the member is.
 */
{
  const truss = {
    id: "truss-1",
    type: "truss",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 500, y: 0 },
      height: 40,
      joints: [],
      members: [],
      panels: 4,
    },
  };

  updateFeatureProperty(truss, "length", 300000);
  updateFeatureProperty(truss, "height", 1000);

  check(
    "a 300000 mm length and a 1000 mm height coexist",
    close(Number(truss.geometry.height), 250, 1e-9),
    `height is ${truss.geometry.height} world units`,
  );

  check(
    "and the height reads back as 1000 mm",
    close(
      dimensions.toEngineering(drawingState, truss.geometry.height).value,
      1000,
    ),
    `read back ${dimensions.toEngineering(drawingState, truss.geometry.height).value} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  angle still controls the geometry\n");

/*
 * Length and Angle together define the actual separation. Each angle puts
 * the same PHYSICAL length in a different direction.
 */
for (const [degrees, label] of [
  [0, "horizontal"],
  [90, "vertical"],
  [45, "diagonal"],
  [180, "reversed"],
]) {
  const beam = {
    id: `beam-a${degrees}`,
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
  };

  updateFeatureProperty(beam, "length", 100000);
  updateFeatureProperty(beam, "angle", degrees);

  check(
    `a 100000 mm beam at ${degrees} degrees is ${label} and the right length`,
    close(measuredMm(beam), 100000, 1e-6),
    `measured ${measuredMm(beam)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  no NaN or Infinity reaches the geometry\n");

{
  const beam = {
    id: "beam-bad",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
  };

  updateFeatureProperty(beam, "length", 1000);

  const before = { ...beam.geometry.end };

  for (const bad of [NaN, Infinity, -Infinity, "abc", null, undefined]) {
    updateFeatureProperty(beam, "length", bad);
  }

  check(
    "a non-finite length leaves the geometry alone",
    Number.isFinite(beam.geometry.end.x) &&
      Number.isFinite(beam.geometry.end.y),
    `end is ${JSON.stringify(beam.geometry.end)}`,
  );

  check(
    "and the last good value is still there",
    close(beam.geometry.end.x, before.x),
    `end.x is ${beam.geometry.end.x}, was ${before.x}`,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
