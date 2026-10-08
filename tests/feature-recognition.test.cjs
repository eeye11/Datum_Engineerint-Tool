/*
 * ========================================================
 * EVERY FEATURE, IN THE GENERAL SYSTEMS
 * ========================================================
 *
 * The requirement: every feature a DAETUM tool can create must be recognised by
 * the SHARED systems - Select, Box Select and Fit - rather than only by the
 * tool that made it.
 *
 * This is an AUDIT, and it is written as one: it builds a document containing
 * one of every feature type, then asks each general system about each feature
 * and reports what it answered. The name of every feature that is invisible to
 * a system is printed, so the gap is a list rather than a paragraph.
 *
 * The three questions, which are what the three systems actually do:
 *
 *   SELECT     can a click find it?        (hit-testing `objectAtPoint`)
 *   BOX        does a rectangle crossing it take it?  (`objectIntersectsSelection`)
 *   FIT        does it contribute an extent?          (`renderedBounds`)
 *
 * A feature that fails one is not necessarily broken - a feature with no extent
 * of its own has nothing to contribute to Fit - but every feature should be
 * SELECTABLE, and anything drawn across the sheet should be box-selectable and
 * should count towards Fit.
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

let pass = 0;
let fail = 0;

const report = [];

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
global.SVGElement = dom.window.SVGElement;

const state = require(modulePath("drawing-state.js")).default;
const hit = require(modulePath("hit-testing.js"));
const box = require(modulePath("box-selection.js"));
const viewport = require(modulePath("viewport.js"));

/* ============================================================
 * ONE OF EVERYTHING
 * ============================================================ */

const st = state.createDrawingState();
global.window.enggDrawing = { state: st };

const F = state.geometryFactories;

/*
 * Each entry is built, added, and remembered with a POINT THAT IS ON IT - the
 * place a click would land. That point is what the three systems are asked
 * about, so a feature is never declared invisible merely because the audit
 * aimed at the wrong spot.
 */
const FEATURES = [];

function add(label, object, onPoint) {
  state.addObject(st, object);

  FEATURES.push({ label, object, onPoint });

  return object;
}

/* --- Geometry -------------------------------------------------------- */

add(
  "Line",
  F.line({ x: 0, y: 0 }, { x: 120, y: 0 }),
  { x: 60, y: 0 },
);

add("Point", F.point({ x: 200, y: 0 }), { x: 200, y: 0 });

add(
  "Circle",
  F.circle({ x: 300, y: 0 }, 30),
  { x: 330, y: 0 },
);

add(
  "Rectangle",
  F.rectangle({ x: 400, y: 0 }, 80, 50),
  { x: 400, y: 0 },
);

add(
  "Triangle",
  F.triangle([
    { x: 600, y: 0 },
    { x: 700, y: 0 },
    { x: 600, y: 60 },
  ]),
  { x: 650, y: 0 },
);

add(
  "Polygon",
  F.polygon({ x: 800, y: 0 }, 40, 6),
  { x: 840, y: 0 },
);

add(
  "Arc",
  F.arc({ x: 900, y: 0 }, 30, 0, Math.PI / 2),
  { x: 930, y: 0 },
);

add(
  "Polyline",
  F.polyline([
    { x: 1000, y: 0 },
    { x: 1060, y: 0 },
    { x: 1060, y: 40 },
  ]),
  { x: 1030, y: 0 },
);

/* --- Statics --------------------------------------------------------- */

add(
  "Beam",
  F.beam({ x: 0, y: 200 }, { x: 160, y: 200 }),
  { x: 80, y: 200 },
);

add(
  "Cable",
  F.cable({ x: 300, y: 200 }, { x: 460, y: 200 }),
  { x: 380, y: 200 },
);

add(
  "Shaft",
  F.shaft({ x: 600, y: 200 }, { x: 760, y: 200 }),
  { x: 680, y: 200 },
);

add(
  "Particle",
  F.particle({ x: 850, y: 200 }),
  { x: 850, y: 200 },
);

add(
  "Rigid Body",
  F["rigid-body"]({ x: 1000, y: 200 }, 60, 40),
  { x: 1000, y: 200 },
);

add(
  "Point Force",
  F.force({ x: 200, y: 300 }, { x: 200, y: 360 }),
  { x: 200, y: 330 },
);

add(
  "Distributed Load",
  F.load({ x: 400, y: 300 }, { x: 560, y: 300 }, 5),
  { x: 480, y: 300 },
);

add(
  "Varying Load",
  F["varying-load"]({ x: 700, y: 300 }, { x: 860, y: 300 }, 5, 12),
  { x: 780, y: 300 },
);

add(
  "Moment",
  F.moment({ x: 950, y: 300 }, 250, "CCW"),
  { x: 950, y: 300 },
);

add(
  "Pin Support",
  F["pin-support"]({ x: 40, y: 200 }),
  { x: 40, y: 200 },
);

add(
  "Fixed Support",
  F["fixed-support"]({ x: 160, y: 200 }),
  { x: 160, y: 200 },
);

/* --- Analysis -------------------------------------------------------- */

add(
  "Analysis Diagram (SFD)",
  F["shear-force-diagram"]({ x: 0, y: 500 }, { x: 200, y: 500 }),
  { x: 100, y: 500 },
);

add(
  "Resultant",
  F.resultant({ x: 300, y: 500 }, { x: 380, y: 560 }),
  { x: 340, y: 530 },
);

/* --- Dimensions ------------------------------------------------------ */

const lineForDim = st.objects.find((o) => o.type === "line");

add(
  "Dimension",
  F.dimension({
    dimensionType: "horizontal",
    refs: [
      { kind: "between", featureId: lineForDim.id, anchor: "start" },
      { kind: "between", featureId: lineForDim.id, anchor: "end" },
    ],
    placement: { x: 60, y: -40 },
  }),
  { x: 60, y: -40 },
);

add(
  "Variable Dimension",
  F["variable-dimension"]({
    refs: [
      { kind: "between", featureId: lineForDim.id, anchor: "start" },
      { kind: "between", featureId: lineForDim.id, anchor: "end" },
    ],
    placement: { x: 60, y: -90 },
    symbol: "L",
  }),
  { x: 60, y: -90 },
);

/* --- Annotate -------------------------------------------------------- */

add(
  "Note",
  F.annotate({ kind: "note", text: "Note", position: { x: 300, y: -40 } }),
  { x: 300, y: -40 },
);

add(
  "Label",
  F.annotate({ kind: "label", text: "A", position: { x: 400, y: -40 } }),
  { x: 400, y: -40 },
);

add(
  "Leader",
  F.annotate({
    kind: "leader",
    text: "R",
    start: { x: 500, y: -40 },
    end: { x: 560, y: -40 },
  }),
  { x: 530, y: -40 },
);

add(
  "Callout",
  F.annotate({
    kind: "callout",
    text: "C",
    start: { x: 650, y: -40 },
    end: { x: 710, y: -40 },
  }),
  { x: 680, y: -40 },
);

add(
  "Arrow",
  F.annotate({
    kind: "arrow",
    start: { x: 800, y: -40 },
    end: { x: 860, y: -40 },
  }),
  { x: 830, y: -40 },
);

add(
  "Symbol",
  F.annotate({ kind: "symbol", position: { x: 950, y: -40 } }),
  { x: 950, y: -40 },
);

add(
  "Tolerance",
  F.annotate({ kind: "tolerance", position: { x: 1050, y: -40 } }),
  { x: 1050, y: -40 },
);

add(
  "Table",
  F.annotate({
    kind: "table",
    position: { x: 1150, y: -40 },
    rows: 2,
    columns: 3,
  }),
  { x: 1150, y: -40 },
);

add(
  "Coordinate System",
  F.coordinateSystem2D({ x: 1250, y: -40 }),
  { x: 1250, y: -40 },
);

/* ============================================================
 * ASK THE THREE SYSTEMS
 * ============================================================ */

console.log(`\n  auditing ${FEATURES.length} feature types\n`);

const tiny = (point) => ({
  minX: point.x - 6,
  minY: point.y - 6,
  maxX: point.x + 6,
  maxY: point.y + 6,
});

const failures = { select: [], box: [], fit: [] };

FEATURES.forEach(({ label, object, onPoint }) => {
  let selectable = false;

  try {
    selectable = Boolean(hit.objectAtPoint(onPoint));
  } catch (error) {
    selectable = false;
  }

  let boxable = false;

  try {
    boxable = box.objectIntersectsSelection(object, tiny(onPoint)) === true;
  } catch (error) {
    boxable = false;
  }

  let bounded = false;

  try {
    bounded = (viewport.renderedBounds(object, 1) || []).length > 0;
  } catch (error) {
    bounded = false;
  }

  report.push({
    label,
    selectable,
    boxable,
    bounded,
  });

  if (!selectable) failures.select.push(label);
  if (!boxable) failures.box.push(label);
  if (!bounded) failures.fit.push(label);
});

console.log("  feature".padEnd(28) + "select  box     fit");

report.forEach((row) => {
  console.log(
    "  " +
      row.label.padEnd(26) +
      (row.selectable ? "  ok  " : "  --  ") +
      (row.boxable ? "  ok  " : "  --  ") +
      (row.bounded ? "  ok  " : "  --  "),
  );
});

console.log("\n  EVERY FEATURE IS SELECTABLE\n");

check(
  "a click finds every feature type",
  failures.select.length === 0,
  failures.select.length
    ? `invisible to Select: ${failures.select.join(", ")}`
    : "",
);

console.log("\n  EVERY FEATURE IS BOX-SELECTABLE\n");

check(
  "a selection rectangle takes every feature it crosses",
  failures.box.length === 0,
  failures.box.length
    ? `invisible to Box Select: ${failures.box.join(", ")}`
    : "",
);

console.log("\n  EVERY FEATURE CONTRIBUTES TO FIT\n");

check(
  "every feature has an extent Fit can use",
  failures.fit.length === 0,
  failures.fit.length
    ? `invisible to Fit: ${failures.fit.join(", ")}`
    : "",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
