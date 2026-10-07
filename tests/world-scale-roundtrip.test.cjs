/*
 * ========================================================
 * THE ROUND TRIP, THROUGH THE REAL PANEL AND THE REAL WRITER
 * ========================================================
 *
 * The other two world-scale tests check the conversion pair and the panel's
 * markup. This one drives the ACTUAL feature panel and the ACTUAL property
 * writer together on a CALIBRATED sheet, and checks that:
 *
 *   1. the number the panel prints is the geometry measured in the sheet's
 *      units, and
 *   2. typing a physical value moves the geometry by that physical distance.
 *
 * That is the whole requirement: the value in a Features tab always
 * corresponds to the geometry on the calibrated sheet, and editing it
 * changes the geometry through the same World Scale.
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
const { mmOf } = require(modulePath("handles.js"));

/* A CALIBRATED SHEET: 1 world unit = 4 mm. */
const MM_PER_UNIT = 4;

drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };

const close = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

/* ---------------------------------------------------------------- */
console.log("\n  a Beam's length round trips through the scale\n");

{
  /* 100 world units long. On this sheet that is 400 mm. */
  const beam = {
    id: "beam-1",
    type: "beam",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    },
  };

  const stored = Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

  check("the geometry is 100 world units long", close(stored, 100));

  check(
    "and the panel shows it as 400 mm",
    mmOf(stored).value === 400,
    `showed ${mmOf(stored).value}`,
  );

  /* Type 1000 mm into Length. */
  updateFeatureProperty(beam, "length", 1000);

  const after = Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

  check(
    "typing 1000 mm makes the geometry 250 world units",
    close(after, 250),
    `geometry is ${after}`,
  );

  check(
    "and the panel now reads back exactly 1000 mm",
    close(mmOf(after).value, 1000),
    `read back ${mmOf(after).value}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a coordinate round trips through the scale\n");

{
  const line = {
    id: "line-1",
    type: "line",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 50, y: 0 },
    },
  };

  check(
    "a start at x = 0 world shows as 0 mm",
    mmOf(line.geometry.start.x).value === 0,
  );

  /* Type 200 mm into Start X. */
  updateFeatureProperty(line, "start.x", 200);

  check(
    "typing 200 mm puts the start at 50 world units",
    close(line.geometry.start.x, 50),
    `start.x is ${line.geometry.start.x}`,
  );

  check(
    "and the panel reads back exactly 200 mm",
    close(mmOf(line.geometry.start.x).value, 200),
    `read back ${mmOf(line.geometry.start.x).value}`,
  );

  /* A Y coordinate converts the same way. */
  updateFeatureProperty(line, "end.y", -400);

  check(
    "typing -400 mm puts the end at -100 world units",
    close(line.geometry.end.y, -100),
    `end.y is ${line.geometry.end.y}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a Point Force's application point converts too\n");

{
  const force = {
    id: "force-1",
    type: "force",
    geometry: {
      start: { x: 10, y: 20 },
      position: { x: 10, y: 20 },
      magnitude: 100,
      angle: -90,
    },
  };

  check(
    "the application point shows in millimetres",
    mmOf(force.geometry.position.x).value === 40,
    `showed ${mmOf(force.geometry.position.x).value}`,
  );

  updateFeatureProperty(force, "position.x", 600);

  check(
    "typing 600 mm moves it to 150 world units",
    close(force.geometry.position.x, 150),
    `position.x is ${force.geometry.position.x}`,
  );

  check(
    "and it reads back as 600 mm",
    close(mmOf(force.geometry.position.x).value, 600),
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  an angle is never scaled\n");

{
  const force = {
    id: "force-2",
    type: "force",
    geometry: {
      start: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
      magnitude: 100,
      angle: -90,
    },
  };

  /* 30 degrees must stay 30 degrees on a 4 mm-per-unit sheet. */
  updateFeatureProperty(force, "angle", 30);

  check(
    "typing a 30 degree angle stores 30 degrees",
    close(Number(force.geometry.angle), 30, 1e-6),
    `angle is ${force.geometry.angle}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  recalibrating does not move the geometry\n");

{
  const beam = {
    id: "beam-2",
    type: "beam",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    },
  };

  const before = { ...beam.geometry.end };

  /* The sheet is recalibrated: now 1 world unit is 2 mm. */
  drawingState.scale = { mmPerUnit: 2, unit: "mm" };

  check(
    "the geometry is untouched by the recalibration",
    beam.geometry.end.x === before.x && beam.geometry.end.y === before.y,
  );

  check(
    "and the same geometry now reads as 200 mm, not 400",
    mmOf(100).value === 200,
    `read as ${mmOf(100).value}`,
  );

  /* Restore, so the sheet's state does not leak into a later test. */
  drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
