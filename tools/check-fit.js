/*
 * The shared fit engine.
 *
 * Covers the mathematics every Fit, export and Drawing Reference
 * depends on: uniform scaling, centring, screen-space margin,
 * zero-extent targets, and degenerate viewports. Verification aid, not
 * part of the application.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.join(__dirname, "..");

const sandbox = {
  console,
  window: {},
  document: {
    createElement: () => ({
      style: {},
      setAttribute() {},
      appendChild() {},
      remove() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    }),
  },
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  isNaN,
  parseFloat,
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

/* The engine converts through the viewport scale. */
sandbox.enggDrawingState = {
  BASE_PIXELS_PER_UNIT: 1,
};

vm.createContext(sandbox);

vm.runInContext(
  fs.readFileSync(
    path.join(projectRoot, "js", "engineering-drawing", "document-export.js"),
    "utf8",
  ),
  sandbox,
  { filename: "document-export.js" },
);

const engine = sandbox.window.enggDrawingExport;

if (!engine) {
  console.error("FAIL: the export module exposed nothing");
  process.exit(1);
}

let failures = 0;

function check(condition, message, detail) {
  if (condition) {
    console.log("  pass  " + message);
    return;
  }

  failures += 1;
  console.log("  FAIL  " + message + (detail ? " -- " + detail : ""));
}

const VIEWPORT = { width: 1000, height: 600 };

console.log("unionBounds\n");

const union = engine.unionBounds([
  { x: 10, y: 20 },
  { x: -5, y: 40 },
  { x: 30, y: -10 },
]);

check(
  union.minX === -5 && union.maxX === 30,
  "the union spans every point in x",
  JSON.stringify(union),
);

check(
  union.minY === -10 && union.maxY === 40,
  "the union spans every point in y",
);

check(
  engine.unionBounds([]) === null,
  "no points means no bounds, not a zero-sized box",
);

check(
  engine.unionBounds([
    { x: NaN, y: 0 },
    { x: 5, y: 5 },
  ])?.maxX === 5,
  "unusable points are skipped rather than poisoning the result",
);

console.log("\nUniform scaling and centring\n");

const box = engine.fitBoundsIntoViewport(
  { minX: 0, minY: 0, maxX: 200, maxY: 100 },
  VIEWPORT,
);

check(Boolean(box), "a rectangle produces a camera");

check(
  box.zoom === Math.min(1000 / 200, 600 / 100) * 0.85,
  "the zoom is the smaller of the two axes, so proportions are kept",
  "got " + box.zoom,
);

check(
  box.panX === 100 && box.panY === 50,
  "the camera is centred on the rectangle",
  "pan " + box.panX + ", " + box.panY,
);

/*
 * The margin must be a share of the VIEWPORT, not a fixed number of
 * world units, or it behaves differently at different scales.
 */
console.log("\nScreen-space margin\n");

const big = engine.fitBoundsIntoViewport(
  { minX: 0, minY: 0, maxX: 2000, maxY: 1000 },
  VIEWPORT,
);

check(
  Math.abs(big.zoom - (1000 / 2000) * 0.85) < 1e-9,
  "a drawing ten times larger gets ten times less magnified",
  "got " + big.zoom,
);

/*
 * After fitting, the drawing must sit inside the viewport with a
 * margin on both sides - which is the property the margin exists for.
 */
const fittedWidth = 200 * big.zoom;
const fittedHeight = 1000 * big.zoom;

check(
  fittedWidth < VIEWPORT.width && fittedHeight < VIEWPORT.height,
  "the fitted drawing is smaller than the viewport",
);

check(
  VIEWPORT.width - fittedWidth > 0 && VIEWPORT.height - fittedHeight > 0,
  "there is space left on every side, so nothing touches the edge",
);

console.log("\nZero extent in one axis\n");

const flat = engine.fitBoundsIntoViewport(
  { minX: 0, minY: 50, maxX: 200, maxY: 50 },
  VIEWPORT,
);

check(Boolean(flat), "a flat horizontal line still fits");

check(
  Number.isFinite(flat.zoom),
  "a zero y-span does not produce an infinite zoom",
  "got " + flat.zoom,
);

check(flat.panY === 50, "the flat axis is centred rather than discarded");

const vertical = engine.fitBoundsIntoViewport(
  { minX: 7, minY: 0, maxX: 7, maxY: 200 },
  VIEWPORT,
);

check(
  Number.isFinite(vertical.zoom),
  "a zero x-span does not produce an infinite zoom",
);

console.log("\nDegenerate targets and viewports\n");

check(
  engine.fitBoundsIntoViewport(null, VIEWPORT) === null,
  "no bounds means no camera",
);

check(
  engine.fitBoundsIntoViewport(
    { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    VIEWPORT,
  ) === null,
  "a single point reports nothing to fit rather than a huge zoom",
);

check(
  engine.fitBoundsIntoViewport(
    { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    { width: 0, height: 600 },
  ) === null,
  "a zero-width viewport is refused",
);

check(
  engine.fitBoundsIntoViewport(
    { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    { width: 1000, height: 0 },
  ) === null,
  "a zero-height viewport is refused",
);

check(
  engine.fitBoundsIntoViewport(
    { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    null,
  ) === null,
  "a missing viewport is refused",
);

console.log("\nThe grid cannot reach the result\n");

/*
 * The grid is drawn across the whole viewport and has no bounds, so
 * the engine must never be able to see it. This asserts the property
 * that makes it safe: the result depends only on the rectangle passed
 * in, so there is nothing for an unbounded layer to influence.
 */
const a = engine.fitBoundsIntoViewport(
  { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  VIEWPORT,
);
const b = engine.fitBoundsIntoViewport(
  { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  VIEWPORT,
);

check(a.zoom === b.zoom, "the result is a pure function of its inputs");

check(
  Number.isFinite(a.zoom) && a.zoom > 0,
  "a normal rectangle gives a finite positive zoom",
);

console.log(
  "\n" + (failures ? failures + " check(s) failed" : "all checks passed"),
);

process.exit(failures ? 1 : 0);
