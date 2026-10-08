/*
 * ========================================================
 * STATICS TOOLS TAKE BOTH CREATION GESTURES
 * ========================================================
 *
 * THE DEFECT: a Statics SPAN tool answered "yes" to the drag question on the
 * tool alone, and a press STARTED its feature and armed a drag session - so a
 * plain CLICK completed the span at its own start point, before the student had
 * moved. A support attached to a body, a load's span, a beam: every one of them
 * committed something the moment the mouse went down and came up in the same
 * place.
 *
 * Click-move-click was therefore impossible for any Statics tool.
 *
 * The gesture is now classified on RELEASE, by how far the pointer travelled,
 * so the same tools take either gesture with no mode to choose.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");

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
  url: "https://datum.test/"
});

global.window = dom.window;
global.document = dom.window.document;

const tools = require(modulePath("statics-tools.js"));
const drag = require(modulePath("creation-drag.js"));

console.log("\n  the Statics span tools take part in the drag workflow\n");

[
  "point-force",
  "beam",
  "cable",
  "shaft",
  "pin-connection",
  "fixed-connection",
  "slider-connection",
  "reference-line"
].forEach((toolId) => {
  check(
    `${toolId} is a drag-capable span tool`,
    drag.isDragCreationTool(toolId) === true,
    `${toolId} is in STATICS_SPAN_TOOLS: ${Boolean(tools.STATICS_SPAN_TOOLS[toolId])}`
  );
});

console.log("\n  single-click placements keep their own interaction\n");

[
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support",
  "reference-point",
  "particle"
].forEach((toolId) => {
  check(
    `${toolId} is NOT a drag tool`,
    drag.isDragCreationTool(toolId) === false,
    "a support is placed where the click lands - there is no second point"
  );
});

console.log("\n  multi-stage tools are left to their own workflow\n");

["truss", "polyline", "moment"].forEach((toolId) => {
  check(
    `${toolId} keeps its own construction`,
    drag.isDragCreationTool(toolId) === false,
    "a flow of points has no single meaning for a release"
  );
});

console.log("\n  the reference arc is the arc tool by another name\n");

check(
  "reference-arc takes part in the drag workflow",
  drag.isDragCreationTool("reference-arc") === true,
  "it draws through the same centre/sweep or three-point phases as the arc"
);

check(
  "and both arc tools are listed together",
  /DRAG_GEOMETRY_TOOLS = \[[\s\S]{0,300}"arc"[\s\S]{0,200}"reference-arc"/.test(
    fs.readFileSync(modulePath("creation-drag.js"), "utf8")
  ),
  "the arc was listed and its reference twin was not"
);

console.log("\n  Statics spans share the ONE creation pipeline\n");

{
  const source = fs.readFileSync(modulePath("creation-drag.js"), "utf8");

  check(
    "a Statics span is begun through the ordinary entry point",
    /if \(session\.pressResolution\) \{\s*\n\s*beginOrCompleteGeometry\(\s*\n\s*session\.pressResolution/.test(
      source,
    ),
    "a second path would be a second set of snapping and undo rules"
  );

  check(
    "and completed through the same one",
    /beginOrCompleteGeometry\(\s*resolvePointerEvent\(event\)\s*\)/.test(source)
  );

  check(
    "the drag module builds no Statics geometry itself",
    !/createStaticsFeature/.test(source) &&
      !/geometryFactories/.test(source) &&
      !/commitDrawingChange/.test(source),
    "it adds a lifetime, not an implementation"
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}

void dom;
