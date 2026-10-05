/*
 * Audit: the shared vector arrow, at the renderer, in every quadrant.
 *
 * The claim under test (§23): one shared arrow draws every vector, the line
 * runs tail-to-head, and the arrowhead TIP is exactly at the head - in all
 * eight directions. The historical defect put the two base corners on the SAME
 * side of the axis, which looked correct on the axes and broke on the
 * diagonals.
 *
 * This drives the REAL renderer through a minimal SVG DOM and inspects the
 * geometry it produces.
 */
const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..", "..");
const dir = path.join(projectRoot, "js", "engineering-drawing");

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

/* ---- A real jsdom document, so createElementNS produces walkable nodes ---- */

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.window.crypto = { randomUUID: () => "arrow-uuid" };
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.window.requestAnimationFrame = global.requestAnimationFrame;

for (const name of [
  "body-frames.js",
  "load-profile.js",
  "feature-geometry.js",
  "drawing-state.js",
  "analysis-dependencies.js",
  "diagram-equations.js",
  "renderer.js",
]) {
  require(path.join(dir, name));
}

for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggLoadProfile",
  "enggFeatureGeometry",
  "enggBodyFrames",
  "enggDiagramEquations",
  "enggAnalysisDependencies",
]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

const R = global.window.enggDrawingRenderer;

console.log("\n== The renderer exposes a shared arrow ==\n");

/*
 * The arrow is built inside the renderer's IIFE. What is reachable is the
 * module's public surface; if a direct `appendVectorArrow` is not exported,
 * the arrow is still exercised through a feature that uses it (below).
 */
check("the renderer module loaded", Boolean(R));

/*
 * The renderer draws into an SVG root it is given. Build one and ask it to
 * render a force, then read the geometry back.
 */
function renderForce(angle, magnitude = 100) {
  const radians = (angle * Math.PI) / 180;

  const force = global.window.enggDrawingState.geometryFactories.force(
    { x: 0, y: 0 },
    { x: magnitude * Math.cos(radians), y: magnitude * Math.sin(radians) },
  );

  const state = {
    objects: [force],
    selection: { selectedObjectIds: [], boxSelectionIds: [], hoveredObjectId: null },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
    grid: {},
    styleDefaults: {},
    scale: null,
  };

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );

  /*
   * renderDrawing takes a CANVAS and finds (or creates) the SVG inside it,
   * looking for `.drawing-renderer`. The harness hands back our SVG root for
   * that selector and captures anything appended, so the element the renderer
   * actually draws into is the one inspected.
   */
  let mounted = svg;

  const canvas = {
    querySelector: (selector) =>
      String(selector).indexOf("drawing-renderer") >= 0 ? mounted : null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    }),
    clientWidth: 800,
    clientHeight: 600,
    appendChild: (child) => {
      mounted = child;
    },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null,
  };

  try {
    R.renderDrawing(state, canvas);
  } catch (error) {
    return { error: error.message };
  }

  return { svg: mounted, force };
}

/* Walk every descendant of the svg and collect the primitives drawn. */
function collect(node, out = []) {
  for (const child of Array.from(node.childNodes || [])) {
    out.push(child);
    collect(child, out);
  }
  return out;
}

console.log("\n== A force arrow is drawn tail-to-head in every quadrant ==\n");

const QUADRANTS = [
  ["+X", 0, 1, 0],
  ["-X", 180, -1, 0],
  ["+Y", 90, 0, 1],
  ["-Y", -90, 0, -1],
  ["+X+Y", 45, 1, 1],
  ["-X+Y", 135, -1, 1],
  ["-X-Y", -135, -1, -1],
  ["+X-Y", -45, 1, -1],
];

for (const [label, angle] of QUADRANTS) {
  const result = renderForce(angle);

  if (result.error) {
    check(`force ${label}: renders without throwing`, false, result.error);
    continue;
  }

  const primitives = collect(result.svg);
  const lines = primitives.filter((n) => n.tagName === "line");
  const polygons = primitives.filter(
    (n) => n.tagName === "polygon" || n.tagName === "path",
  );

  check(
    `force ${label}: a shaft line and an arrowhead are drawn`,
    lines.length >= 1 && polygons.length >= 1,
    `lines=${lines.length} heads=${polygons.length}`,
  );

  /* The shaft must run from the world origin to the world head. */
  const shaft = lines[0];

  if (shaft) {
    const x1 = Number(shaft.getAttribute("x1"));
    const y1 = Number(shaft.getAttribute("y1"));
    const x2 = Number(shaft.getAttribute("x2"));
    const y2 = Number(shaft.getAttribute("y2"));

    check(
      `force ${label}: the shaft starts at the application point`,
      Math.abs(x1 - 400) < 0.5 && Math.abs(y1 - 300) < 0.5,
      `tail (${x1}, ${y1})`,
    );

    check(
      `force ${label}: the shaft has a real length`,
      Math.hypot(x2 - x1, y2 - y1) > 1,
      `length ${Math.hypot(x2 - x1, y2 - y1)}`,
    );

    /*
     * THE ARROWHEAD TIP IS EXACTLY THE HEAD - the requirement §23 states.
     *
     * The head polygon's first point is the tip, and it must coincide with
     * the shaft's far end. A tip that merely sits NEAR the head reads as an
     * arrow that stops short or overshoots.
     */
    const headPoly = polygons[0];

    if (headPoly && headPoly.tagName === "polygon") {
      const pts = String(headPoly.getAttribute("points") || "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number));

      check(
        `force ${label}: the arrowhead tip coincides with the shaft head`,
        pts.length === 3 &&
          Math.abs(pts[0][0] - x2) < 1e-6 &&
          Math.abs(pts[0][1] - y2) < 1e-6,
        `tip ${JSON.stringify(pts[0])} vs head (${x2}, ${y2})`,
      );

      /*
       * AND THE TWO BASE CORNERS ARE ON OPPOSITE SIDES OF THE AXIS.
       *
       * This is the defect that looked correct on the axes and broke on the
       * diagonals: with both corners on one side the head reads as a fin, not
       * an arrow. The cross product of the axis with each corner's offset has
       * opposite signs for a symmetric triangle.
       */
      if (pts.length === 3) {
        const ax = x2 - x1;
        const ay = y2 - y1;

        const sideOf = (corner) =>
          ax * (corner[1] - y2) - ay * (corner[0] - x2);

        const s1 = sideOf(pts[1]);
        const s2 = sideOf(pts[2]);

        check(
          `force ${label}: the head's base corners straddle the axis`,
          s1 * s2 < 0,
          `sides ${s1} and ${s2} (same sign means a fin, not an arrow)`,
        );
      }
    } else {
      check(`force ${label}: an arrowhead polygon was produced`, false, "none");
    }
  }

  check(
    `force ${label}: no NaN reached the drawing`,
    !/NaN/.test(
      JSON.stringify(
        primitives.map((n) => (n.getAttribute ? n.getAttribute("points") || "" : "")),
      ),
    ) &&
      !primitives.some((n) =>
        (n.getAttribute ? n.getAttribute("x1") || "" : "").includes("NaN"),
      ),
    "an attribute contains NaN, which the browser rejects",
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);