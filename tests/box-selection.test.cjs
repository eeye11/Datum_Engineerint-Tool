/*
 * ========================================================
 * BOX SELECTION: WHAT A RECTANGLE TOUCHES
 * ========================================================
 *
 * The requirement, restated as tests: a selection rectangle selects every
 * feature whose DRAWN GEOMETRY it crosses - not merely the features whose
 * centre happens to fall inside it - and it does so for the graph features
 * (SFD/BMD/AFD) as well as for bodies, loads and supports.
 *
 * THE DEFECT THIS PINS. A hand-drawn diagram's strokes are stored in
 * GRAPH-LOCAL coordinates: x is a station on the member, y is the value in kN
 * or kN·m. The sheet draws them through a projection that maps the station onto
 * the member's length and the value onto the frame's scale. Box selection used
 * to test the RAW stored numbers, which are not where the ink is, so a
 * rectangle drawn over a curve found nothing.
 *
 * The fix projects the strokes with the renderer's own `analysisSketchMarks`,
 * so the rectangle and the ink are the same geometry.
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
const box = require(modulePath("box-selection.js"));
const renderer = require(modulePath("renderer.js")).default;

const st = state.createDrawingState();
global.window.enggDrawing = { state: st };

const rect = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });

/* ============================================================
 * THE BASICS: a line crossed by the rectangle
 * ============================================================ */

console.log("\n  a rectangle selects what it CROSSES, not what it contains\n");

{
  const line = state.geometryFactories.line({ x: 0, y: 0 }, { x: 100, y: 0 });

  check(
    "a long line whose middle the rectangle crosses is selected",
    box.objectIntersectsSelection(line, rect(40, -10, 60, 10)) === true,
    "most of the line lies outside the box",
  );

  check(
    "and a rectangle nowhere near it does not",
    box.objectIntersectsSelection(line, rect(200, 200, 260, 260)) === false,
  );

  check(
    "a rectangle that merely touches an endpoint still selects it",
    box.objectIntersectsSelection(line, rect(100, -5, 140, 5)) === true,
  );

  check(
    "a degenerate rectangle drawn exactly ON the line selects it",
    box.objectIntersectsSelection(line, rect(20, 0, 80, 0)) === true,
    "a zero-height drag along the line",
  );
}

/* ============================================================
 * A SKETCHED DIAGRAM: the world-space defect
 * ============================================================ */

console.log(
  "\n  a SKETCHED diagram is selected from its INK, not its raw values\n",
);

{
  /*
   * An SFD sketched on a 100-long member. The stored stroke is a line from
   * graph x = 0, value 0 to graph x = 50, value 40 - GRAPH-LOCAL numbers.
   *
   * The sheet draws it from the member's start, along its length, up by the
   * frame's scale - so the ink is NOT at (0,0)-(50,40) in world space.
   */
  const diagram = state.geometryFactories["shear-force-diagram"](
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  );

  diagram.geometry.mode = "sketch";
  diagram.geometry.localRange = { from: 0, to: 100 };
  diagram.geometry.sketchElements = [
    {
      id: "sketch-1",
      kind: "line",
      start: { x: 0, y: 0 },
      end: { x: 50, y: 40 },
    },
  ];

  const marks = renderer.analysisSketchMarks(diagram.geometry);

  check(
    "the diagram's stroke projects to world-space marks",
    marks.length === 1 && marks[0].points.length === 2,
    JSON.stringify(marks),
  );

  const ink = marks[0].points;

  check(
    "and the marks are NOT the raw stored numbers",
    ink[1].x !== 50 || ink[1].y !== 40,
    `stored (50, 40) projected to (${ink[1].x}, ${ink[1].y})`,
  );

  /* Midpoint of the projected stroke, so the box is aimed at real ink. */
  const mid = {
    x: (ink[0].x + ink[1].x) / 2,
    y: (ink[0].y + ink[1].y) / 2,
  };

  check(
    "a rectangle over the MIDDLE of the drawn stroke selects the diagram",
    box.objectIntersectsSelection(
      diagram,
      rect(mid.x - 2, mid.y - 2, mid.x + 2, mid.y + 2),
    ) === true,
    `box at (${mid.x}, ${mid.y})`,
  );

  check(
    "a rectangle over the RAW stored numbers does NOT",
    box.objectIntersectsSelection(diagram, rect(48, 38, 52, 42)) === false,
    "that is where the ink is not - the defect this fixes",
  );

  check(
    "and a rectangle far away selects nothing",
    box.objectIntersectsSelection(diagram, rect(900, 900, 950, 950)) === false,
  );
}

/* ============================================================
 * A CURVE in a sketch, partly intersecting
 * ============================================================ */

console.log("\n  a partially-intersecting curve is selected\n");

{
  const diagram = state.geometryFactories["bending-moment-diagram"](
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  );

  diagram.geometry.mode = "sketch";
  diagram.geometry.localRange = { from: 0, to: 200 };
  diagram.geometry.sketchElements = [
    {
      id: "sketch-1",
      kind: "curve3",
      start: { x: 0, y: 0 },
      bend: { x: 100, y: 80 },
      end: { x: 200, y: 0 },
    },
  ];

  const marks = renderer.analysisSketchMarks(diagram.geometry);
  const points = marks[0].points;

  /* The highest point of the drawn curve. */
  const peak = points.reduce((best, p) => (p.y > best.y ? p : best), points[0]);

  check(
    "a rectangle over ONLY the top of the curve selects it",
    box.objectIntersectsSelection(
      diagram,
      rect(peak.x - 3, peak.y - 3, peak.x + 3, peak.y + 3),
    ) === true,
    "a small portion entering the box is enough",
  );
}

/* ============================================================
 * STATICS: the same logic, no special case
 * ============================================================ */

console.log("\n  Statics features go through the SAME test\n");

{
  const beam = state.geometryFactories.beam({ x: 0, y: 0 }, { x: 160, y: 0 });

  const support = state.geometryFactories["pin-support"]({ x: 40, y: 0 });
  const force = state.geometryFactories.force(
    { x: 80, y: 0 },
    { x: 80, y: -50 },
  );
  const load = state.geometryFactories.load(
    { x: 0, y: 0 },
    { x: 160, y: 0 },
    5,
  );
  const moment = state.geometryFactories.moment({ x: 120, y: 0 }, 200, 0);

  check(
    "a beam crossed by the rectangle is selected",
    box.objectIntersectsSelection(beam, rect(70, -10, 90, 10)) === true,
  );

  check(
    "a support at the rectangle's edge is selected",
    box.objectIntersectsSelection(support, rect(30, -10, 70, 10)) === true,
  );

  check(
    "a point force is selected along its whole arrow",
    box.objectIntersectsSelection(force, rect(75, -30, 85, -10)) === true,
    "not only at its application point",
  );

  check(
    "a distributed load is selected on its span",
    box.objectIntersectsSelection(load, rect(70, -5, 90, 5)) === true,
  );

  check(
    "a moment is selected at its point",
    box.objectIntersectsSelection(moment, rect(110, -10, 130, 10)) === true,
  );

  check(
    "and a rectangle away from all of them selects none",
    [beam, support, force, load, moment].every(
      (object) =>
        box.objectIntersectsSelection(object, rect(400, 400, 500, 500)) ===
        false,
    ),
  );
}

/* ============================================================
 * ONE SWEEP, MANY FEATURES
 * ============================================================ */

console.log("\n  one rectangle selects several features at once\n");

{
  const objects = [
    state.geometryFactories.line({ x: 0, y: 0 }, { x: 100, y: 0 }),
    state.geometryFactories.line({ x: 0, y: 20 }, { x: 100, y: 20 }),
    state.geometryFactories.line({ x: 0, y: 200 }, { x: 100, y: 200 }),
  ];

  const swept = objects.filter((object) =>
    box.objectIntersectsSelection(object, rect(-5, -5, 105, 25)),
  );

  check(
    "a rectangle spanning two lines takes exactly those two",
    swept.length === 2,
    `took ${swept.length}`,
  );
}

/* ============================================================
 * A DEGENERATE RECTANGLE
 * ============================================================ */

console.log("\n  the rectangle's own corner cases\n");

{
  const point = state.geometryFactories.point({ x: 50, y: 50 });

  check(
    "a zero-size rectangle on a point selects it",
    box.objectIntersectsSelection(point, rect(50, 50, 50, 50)) === true,
  );

  check(
    "a zero-size rectangle beside it does not",
    box.objectIntersectsSelection(point, rect(51, 51, 51, 51)) === false,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
