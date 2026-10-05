
const { JSDOM } = require("jsdom");

const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * THE SKETCH EDITOR
 * ========================================================
 *
 * Sketch is the other half of the Analysis Editor: a Plot is entered as
 * equations, a Sketch is drawn by hand. Both are reached from the same
 * entry point, so this checks the two things that make it usable.
 *
 * ONLY FOUR TOOLS.
 *
 * The general Geometry toolbar is deliberately not offered. A student
 * sketching the shape of one diagram should find two points and a pen, not
 * forty tools - and a Rectangle here is a Line with one more click, so
 * nothing is lost by leaving it out.
 *
 * ENGINEERING, NOT PIXELS.
 *
 * The important property, and the one worth failing over: a point is
 * stored as an (x, y) in the graph's own coordinate system, so a sketch
 * made at one zoom reads identically at another. The test round-trips a
 * point through the scale rather than asserting a screen number, because
 * asserting a screen number would pass even if the scale were wrong in a
 * way that happened to cancel out.
 */


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

const dom = new JSDOM(
  '<!doctype html><html><body></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

loadModule("sketch-editor.js");

const editor = global.window.enggSketchEditor;

check("the sketch editor attaches", Boolean(editor));

console.log("\n  four tools, and only four\n");

const labels = editor.TOOLS.map((t) => t.label);

check(
  "Select, Straight Line, Curve and Erase",
  JSON.stringify(labels) ===
    JSON.stringify([
      "Select",
      "Straight Line",
      "Curve",
      "Erase",
    ]),
  `got ${JSON.stringify(labels)}`,
);

/*
 * NO GENERAL GEOMETRY TOOLS. Named explicitly rather than by count, so a
 * tool added later has to be argued for in the open rather than slipping in
 * alongside the four.
 */
const forbidden = [
  "Rectangle",
  "Circle",
  "Arc",
  "Polygon",
  "Dimension",
  "Text",
  "Construction",
  "Trim",
  "Extend",
  "Coordinate",
];

for (const name of forbidden) {
  check(
    `no "${name}" tool`,
    !labels.some((l) => l.toLowerCase().includes(name.toLowerCase())),
    `found ${JSON.stringify(labels.filter((l) => l.includes(name)))}`,
  );
}

console.log("\n  points are engineering, not pixels\n");

const range = { from: 0, to: 500 };
const scale = editor.makeScale(range, []);

/*
 * ROUND-TRIP, not a screen number. Every point on the graph must come back
 * as itself - if the scale had a wrong span or an offset, this is where it
 * would show, and asserting "x = 37.4" instead would only prove that
 * whatever number came out was written down.
 */
let worstX = 0;
let worstY = 0;

for (let x = 0; x <= 500; x += 25) {
  for (let y = -20; y <= 20; y += 5) {
    const back = scale.fromScreen(
      scale.toScreen({ x, y }),
    );

    worstX = Math.max(worstX, Math.abs(back.x - x));
    worstY = Math.max(worstY, Math.abs(back.y - y));
  }
}

check(
  "x survives the round trip across the whole range",
  worstX < 1e-6,
  `worst error ${worstX}`,
);

check(
  "y survives the round trip too",
  worstY < 1e-6,
  `worst error ${worstY}`,
);

/*
 * AND THE SCALE IS NOT IDENTITY - otherwise the round trip above would pass
 * for a scale that did nothing at all.
 */
const mid = scale.toScreen({ x: 250, y: 0 });

check(
  "the middle of the range is in the middle of the graph",
  mid.x > 200 && mid.x < 360,
  `x=250 mapped to ${mid.x}`,
);

check(
  "a positive value is ABOVE zero, not below",
  scale.toScreen({ x: 0, y: 10 }).y < scale.toScreen({ x: 0, y: 0 }).y,
  "a positive ordinate was drawn downward, so the graph is upside down",
);

console.log("\n  the vertical scale follows the drawing\n");

/*
 * A sketch of a tall diagram needs more room than one of a flat one. If the
 * y scale were fixed, a sketch of a 500 kN moment would run off the top of
 * the box and the student would be told nothing about it.
 */
const flat = editor.makeScale(range, [
  { kind: "line", start: { x: 0, y: 1 }, end: { x: 500, y: 1 } },
]);

const tall = editor.makeScale(range, [
  { kind: "line", start: { x: 0, y: 100 }, end: { x: 500, y: 100 } },
]);

check(
  "a taller sketch is given more vertical room",
  tall.unitHeight > flat.unitHeight,
  `flat ${flat.unitHeight}, tall ${tall.unitHeight}`,
);

const tallestOnScreen =
  tall.toScreen({ x: 0, y: tall.unitHeight }).y;

check(
  "and its peak still sits inside the graph",
  tallestOnScreen > 0,
  `peak mapped to y=${tallestOnScreen}, outside the frame`,
);

console.log("\n  elements, not pixels\n");

check(
  "a line exposes its two endpoints",
  editor.pointsOf({ kind: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
    .length === 2,
);

check(
  "a curve exposes every point it was drawn through",
  editor.pointsOf({ kind: "curve", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    .length === 2,
);

check(
  "a vertical line needs no special tool - it is a line",
  (() => {
    const line = {
      kind: "line",
      start: { x: 250, y: -10 },
      end: { x: 250, y: 10 },
    };

    return (
      line.start.x === line.end.x &&
      editor.pointsOf(line).length === 2
    );
  })(),
);

console.log("\n  and hit testing is in the student's terms\n");

const hitScale = editor.makeScale(range, [
  { id: "a", kind: "line", start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
]);

const onLine = hitScale.toScreen({ x: 250, y: 0 });

check(
  "a point exactly on a stroke has zero distance from it",
  editor.distanceToElement(onLine, { kind: "line", start: { x: 0, y: 0 }, end: { x: 500, y: 0 } }, hitScale) < 1e-6,
);

check(
  "a point well away from it does not",
  editor.distanceToElement(
    { x: onLine.x, y: onLine.y + 120 },
    { kind: "line", start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
    hitScale,
  ) > 100,
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);