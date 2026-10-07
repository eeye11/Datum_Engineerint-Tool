/*
 * ========================================================
 * EDITING A SMART DIMENSION CHANGES THE GEOMETRY
 * ========================================================
 *
 * Once a sheet has a World Scale, typing a value into a dimension is an
 * instruction: make the geometry that size. These tests drive the real edit
 * layer and assert the ACTUAL GEOMETRY moved, not that a label changed.
 *
 * The rule that decides which of the two acts applies:
 *
 *   uncalibrated sheet, first dimension  ->  calibrate, geometry untouched
 *   calibrated sheet, any dimension      ->  edit the geometry
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

const { modulePath, loadModule } = require("./helpers/source-path.cjs");

loadModule("measurement-core.js");
loadModule("dimensions.js");

const dimensionEdit = require(modulePath("dimension-edit.js")).default;
const dimensions = require(modulePath("dimensions.js")).default;
const { drawingState } = require(modulePath("editor-state.js"));

/* A CALIBRATED SHEET: 1 world unit = 4 mm. */
const MM_PER_UNIT = 4;

drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };

const close = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

const mm = (world) => dimensions.toEngineering(drawingState, world).value;

/* A dimension between two anchors of one feature. */
const spanDimension = (featureId, type = "linear") => ({
  id: "dim-1",
  type: "dimension",
  dimensionType: type,
  sourceRefs: [
    { kind: "between", featureId, anchor: "start" },
    { kind: "between", featureId, anchor: "end" },
  ],
});

/* ---------------------------------------------------------------- */
console.log("\n  a Line's dimension resizes the Line\n");

{
  const line = {
    id: "line-1",
    type: "line",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  drawingState.objects = [line];

  check("the line starts 100 world units long", close(100, 100));
  check("and reads as 400 mm", mm(100) === 400);

  const result = dimensionEdit.applyDimensionValue(
    spanDimension("line-1"),
    drawingState,
    700,
  );

  const length = Math.hypot(
    line.geometry.end.x - line.geometry.start.x,
    line.geometry.end.y - line.geometry.start.y,
  );

  check("the edit reports success", result.ok === true, JSON.stringify(result));

  check(
    "700 mm makes the line 175 world units",
    close(length, 175),
    `line is ${length}`,
  );

  check(
    "and it now reads as exactly 700 mm",
    close(mm(length), 700),
    `reads ${mm(length)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a Beam's dimension resizes the Beam\n");

{
  const beam = {
    id: "beam-1",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  drawingState.objects = [beam];

  dimensionEdit.applyDimensionValue(
    spanDimension("beam-1"),
    drawingState,
    1000,
  );

  const length = Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

  check(
    "1000 mm makes the beam 250 world units",
    close(length, 250),
    `beam is ${length}`,
  );

  check(
    "and the beam's own Length property agrees",
    close(mm(length), 1000),
    `reads ${mm(length)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a Circle's diameter resizes the Circle\n");

{
  const circle = {
    id: "circle-1",
    type: "circle",
    geometry: { center: { x: 0, y: 0 }, radius: 25 },
  };

  drawingState.objects = [circle];

  const dim = {
    id: "dim-c",
    type: "dimension",
    dimensionType: "diameter",
    sourceRefs: [
      { kind: "property", featureId: "circle-1", property: "diameter" },
    ],
  };

  dimensionEdit.applyDimensionValue(dim, drawingState, 200);

  check(
    "a 200 mm diameter gives a 25 world-unit radius",
    close(circle.geometry.radius, 25),
    `radius is ${circle.geometry.radius}`,
  );

  check(
    "and the diameter reads back as 200 mm",
    close(mm(circle.geometry.radius * 2), 200),
    `reads ${mm(circle.geometry.radius * 2)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  an Arc's radius resizes the Arc\n");

{
  const arc = {
    id: "arc-1",
    type: "arc",
    geometry: {
      center: { x: 0, y: 0 },
      radius: 25,
      startAngle: 0,
      endAngle: Math.PI / 2,
    },
  };

  drawingState.objects = [arc];

  const dim = {
    id: "dim-a",
    type: "dimension",
    dimensionType: "radius",
    sourceRefs: [{ kind: "property", featureId: "arc-1", property: "radius" }],
  };

  dimensionEdit.applyDimensionValue(dim, drawingState, 300);

  check(
    "a 300 mm radius gives 75 world units",
    close(arc.geometry.radius, 75),
    `radius is ${arc.geometry.radius}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a Rectangle's dimension resizes the Rectangle\n");

{
  const rect = {
    id: "rect-1",
    type: "rectangle",
    geometry: { position: { x: 0, y: 0 }, width: 80, height: 40 },
  };

  drawingState.objects = [rect];

  const dim = {
    id: "dim-r",
    type: "dimension",
    dimensionType: "horizontal",
    sourceRefs: [
      { kind: "between", featureId: "rect-1", anchor: "topLeft" },
      { kind: "between", featureId: "rect-1", anchor: "topRight" },
    ],
  };

  dimensionEdit.applyDimensionValue(dim, drawingState, 400);

  check(
    "a 400 mm width gives 100 world units",
    close(rect.geometry.width, 100),
    `width is ${rect.geometry.width}`,
  );

  check(
    "and the height is untouched",
    close(rect.geometry.height, 40),
    `height is ${rect.geometry.height}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  repeated edits do not compound\n");

{
  const beam = {
    id: "beam-seq",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  drawingState.objects = [beam];

  const dim = spanDimension("beam-seq");

  for (const value of [500, 1000, 2000, 250]) {
    dimensionEdit.applyDimensionValue(dim, drawingState, value);
  }

  const length = Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

  check(
    "the last value in a sequence is exact",
    close(mm(length), 250, 1e-6),
    `reads ${mm(length)} mm`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  a non-finite value is refused, not applied\n");

{
  const beam = {
    id: "beam-bad",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  drawingState.objects = [beam];

  const before = { ...beam.geometry.end };

  const result = dimensionEdit.applyDimensionValue(
    spanDimension("beam-bad"),
    drawingState,
    NaN,
  );

  check("a NaN edit is refused", result.ok === false);

  check(
    "and the geometry is untouched",
    close(beam.geometry.end.x, before.x),
    `end.x is ${beam.geometry.end.x}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  an uncalibrated sheet does not get a scale from a resize\n");

{
  const line = {
    id: "line-bare",
    type: "line",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  const bare = { objects: [line] };

  dimensionEdit.applyDimensionValue(spanDimension("line-bare"), bare, 500);

  check(
    "an uncalibrated sheet is left uncalibrated",
    bare.scale === undefined,
    `scale is ${JSON.stringify(bare.scale)}`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n  which dimensions are editable\n");

{
  const beam = {
    id: "beam-e",
    type: "beam",
    geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  };

  const circle = {
    id: "circle-e",
    type: "circle",
    geometry: { center: { x: 0, y: 0 }, radius: 25 },
  };

  drawingState.objects = [beam, circle];

  check(
    "a beam's span dimension is editable",
    dimensionEdit.dimensionEditable(spanDimension("beam-e"), drawingState),
  );

  check(
    "a circle's diameter is editable",
    dimensionEdit.dimensionEditable(
      {
        dimensionType: "diameter",
        sourceRefs: [
          { kind: "property", featureId: "circle-e", property: "diameter" },
        ],
      },
      drawingState,
    ),
  );

  check(
    "an angle between two features is not a single feature's size",
    !dimensionEdit.dimensionEditable(
      {
        dimensionType: "angular",
        sourceRefs: [
          { kind: "between", featureId: "beam-e", anchor: "start" },
          { kind: "between", featureId: "beam-e", anchor: "end" },
        ],
      },
      drawingState,
    ),
  );

  check(
    "a dimension over deleted geometry is not editable",
    !dimensionEdit.dimensionEditable(spanDimension("gone"), drawingState),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
