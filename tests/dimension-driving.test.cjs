/*
 * ========================================================
 * A DIMENSION STAYS DRIVING
 * ========================================================
 *
 * The requirement: once a value has been defined, a Length or Dimension must
 * keep updating from its geometry - not freeze into a static number - and the
 * Features bar and the sheet must always state the SAME reading.
 *
 * THE DESIGN THAT MAKES THAT TRUE, and what these checks pin:
 *
 *   NOTHING IS STORED. The value is computed from the referenced geometry by
 *   `measurementFor` every time it is asked for - once for the canvas, once for
 *   the panel - so there is no cached number that could drift.
 *
 *   SO MOVING THE GEOMETRY CHANGES THE VALUE, and there is no code path that
 *   could turn it into a static text annotation: the dimension holds
 *   REFERENCES, and a reference cannot hold a number.
 *
 * The distinction from a Variable Dimension is asserted at the end: the same
 * geometry, named rather than measured, states the student's symbol instead.
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;
global.Element = dom.window.Element;

const state = require(modulePath("drawing-state.js")).default;
const model = require(modulePath("dimension-model.js")).default;

/* ============================================================
 * THE VALUE FOLLOWS THE GEOMETRY
 * ============================================================ */

console.log("\n  the value is read from the geometry, never stored\n");

{
  const st = state.createDrawingState();
  const F = state.geometryFactories;

  /* A line 100 long, calibrated 1 drawing unit = 1 mm. */
  const line = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  state.addObject(st, line);

  st.scale = { unitsPerMillimetre: 1, unit: "mm", calibrated: true };

  const dimension = F.dimension({
    dimensionType: "horizontal",
    refs: [
      { kind: "between", featureId: line.id, anchor: "start" },
      { kind: "between", featureId: line.id, anchor: "end" },
    ],
    placement: { x: 50, y: -20 },
  });

  state.addObject(st, dimension);

  const read = () => {
    const m = model.measurementFor(dimension, st);

    return m ? Math.round(m.value * 100) / 100 : null;
  };

  check(
    "the dimension reads the line's length",
    read() === 100,
    `reads ${read()}`,
  );

  /* THE GEOMETRY MOVES: the value must follow with no edit to the dimension. */
  line.geometry.end = { x: 125, y: 0 };

  check(
    "stretching the line to 125 updates the dimension automatically",
    read() === 125,
    `reads ${read()}`,
  );

  /* And again, so it is a live relationship rather than a one-off. */
  line.geometry.end = { x: 60, y: 0 };

  check(
    "and shortening it updates it again",
    read() === 60,
    `reads ${read()}`,
  );

  /*
   * A ROTATED line. The dimension is HORIZONTAL, so it measures the horizontal
   * span - 30 - and not the aligned length of 50. That is the dimension stating
   * what it was asked to state, recomputed from the line's new position rather
   * than from anything it remembered.
   */
  line.geometry.end = { x: 30, y: 40 };

  check(
    "rotating the line updates the dimension's reading",
    read() === 30,
    `reads ${read()}`,
  );

  /*
   * NOTHING ON THE DIMENSION HOLDS A NUMBER. If a value were stored, this would
   * find it - and it is the absence of one that makes "driving" structural
   * rather than a behaviour somebody has to maintain.
   */
  check(
    "the dimension stores no value of its own",
    dimension.value === undefined &&
      dimension.magnitude === undefined &&
      dimension.measured === undefined,
    JSON.stringify({
      value: dimension.value,
      magnitude: dimension.magnitude,
      measured: dimension.measured,
    }),
  );
}

/* ============================================================
 * THE PANEL AND THE SHEET READ THE SAME THING
 * ============================================================ */

console.log("\n  the panel and the canvas ask the SAME function\n");

{
  const panel = require("fs").readFileSync(
    modulePath("feature-panel-markup.js"),
    "utf8",
  );

  check(
    "the dimension's panel row reads the live measurement",
    /function dimensionValueRow[\s\S]{0,600}formatMeasurement/.test(panel),
    "a stored number in the panel is a number that can go stale",
  );

  check(
    "and it is shown as a DERIVED reading, not an editable field",
    /function dimensionValueRow[\s\S]{0,600}drawing-property-derived/.test(panel),
    "typing into a measured dimension would be a request to move the geometry",
  );

  check(
    "the panel says WHAT the value measures",
    /dimensionTypeRow/.test(panel) && /Measures/.test(panel),
  );
}

/* ============================================================
 * THE VARIABLE DIMENSION IS THE OTHER KIND
 * ============================================================ */

console.log("\n  and a VARIABLE states the student's symbol, not the measurement\n");

{
  const st = state.createDrawingState();
  const F = state.geometryFactories;
  const variable = require(modulePath("variable-dimension.js")).default;

  const line = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  state.addObject(st, line);

  const named = F["variable-dimension"]({
    refs: [
      { kind: "between", featureId: line.id, anchor: "start" },
      { kind: "between", featureId: line.id, anchor: "end" },
    ],
    placement: { x: 50, y: -20 },
    symbol: "L",
  });

  check(
    "a 100-long line named L still reads L",
    variable.variableText(named) === "L",
    variable.variableText(named),
  );

  check(
    "and moving the geometry does NOT change what it says",
    (() => {
      line.geometry.end = { x: 500, y: 0 };

      return variable.variableText(named) === "L";
    })(),
    "the reference is still there, but the value is the student's",
  );

  check(
    "though its REFERENCES are still the geometry",
    (named.sourceRefs || []).length === 2 &&
      named.sourceRefs.every((r) => r.featureId === line.id),
    JSON.stringify(named.sourceRefs),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
