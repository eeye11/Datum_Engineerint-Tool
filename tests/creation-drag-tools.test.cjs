/*
 * ========================================================
 * WHICH CREATION TOOLS TAKE THEIR POINTS FROM ONE DRAG
 * ========================================================
 *
 * A two-point feature is created by PRESS, HOLD, DRAG and RELEASE: the
 * press is the first point, the release is the second, and the pointer
 * move between them redraws the preview. The second click is gone.
 *
 * A tool that takes a FLOW of points - a polyline, a truss, a varying load
 * - is NOT one of these: each point is a separate decision and a release
 * has no single meaning. Nor is a single-click placement tool, which has
 * no second point to take from a release at all.
 *
 * `isDragCreationTool` is the one question that decides which tool gets the
 * new gesture and which keeps the click workflow. These checks pin that
 * decision down, because getting it wrong on either side - a span tool that
 * still needs a second click, or a selection that starts a feature - is
 * visible immediately to the student.
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

const creationDrag = require(modulePath("creation-drag.js"));

console.log("\n  the two-point Geometry tools drag\n");

/*
 * A Line, a Rectangle and a Circle are a start point and an end point, so
 * they take the whole feature from one gesture.
 */
["line", "rectangle", "circle"].forEach((tool) => {
  check(
    `${tool} is created by a drag`,
    creationDrag.isDragCreationTool(tool) === true,
  );
});

/*
 * A Triangle, a Polygon and an Arc take more points, but their FIRST span is
 * a start and an end, so the drag supplies that and the tool's own remaining
 * steps carry the rest. The multi-point workflow is preserved.
 */
["triangle", "polygon", "arc"].forEach((tool) => {
  check(
    `${tool} takes its first span from a drag`,
    creationDrag.isDragCreationTool(tool) === true,
  );
});

console.log("\n  the two-point Statics spans drag\n");

/*
 * A Beam, a Cable and a Shaft are placed between two points exactly as a
 * Line is, and a Point Force follows the cursor from its application point.
 */
["beam", "cable", "shaft", "point-force"].forEach((tool) => {
  check(
    `${tool} is created by a drag`,
    creationDrag.isDragCreationTool(tool) === true,
  );
});

/*
 * A Reference Line is a Line in every respect that matters, so it drags too.
 */
{
  check(
    "reference-line is created by a drag",
    creationDrag.isDragCreationTool("reference-line") === true,
  );
}

console.log("\n  the flow-of-points tools keep their click workflow\n");

/*
 * A polyline and a truss take an unbounded sequence of points, so a release
 * cannot mean "finished". They keep their own construction.
 */
["polyline", "truss"].forEach((tool) => {
  check(
    `${tool} does not use the drag workflow`,
    creationDrag.isDragCreationTool(tool) === false,
  );
});

/*
 * BOTH DISTRIBUTED LOADS DRAG THEIR SPAN, even though their later steps - the
 * magnitude/direction vector, the profile points - keep their own click
 * workflow.
 */
["distributed-load", "varying-distributed-load"].forEach((tool) => {
  check(
    `${tool} drags its loaded span`,
    creationDrag.isDragCreationTool(tool) === true,
  );
});

console.log("\n  single-click placement tools are not drag tools\n");

/*
 * A support, a particle, a rigid body and a reference point are placed
 * where the press landed - there is no second point for a release to give.
 */
[
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support",
  "particle",
  "rigid-body",
  "reference-point",
].forEach((tool) => {
  check(
    `${tool} is not a drag-created tool`,
    creationDrag.isDragCreationTool(tool) === false,
  );
});

/*
 * A Moment in free space is placed by one click, and its sizing is its own
 * two-stage interaction - not a span taken from a drag.
 */
check(
  "moment is not a drag-created tool",
  creationDrag.isDragCreationTool("moment") === false,
);

/*
 * A point and a coordinate system are single-click placements.
 */
["point", "coordinate-system-2d"].forEach((tool) => {
  check(
    `${tool} is not a drag-created tool`,
    creationDrag.isDragCreationTool(tool) === false,
  );
});

console.log("\n  dimensions, annotations and analysis are untouched\n");

/*
 * These go through the construction pipeline for its SNAPPING, but their
 * completion is their own - a drag would take it away from them.
 */
[
  "dimension",
  "smart-dimension",
  "annotation",
  "analysis",
].forEach((tool) => {
  check(
    `${tool} is not a drag-created tool`,
    creationDrag.isDragCreationTool(tool) === false,
  );
});

console.log("\n  an unknown or absent tool is never a drag tool\n");

["", null, undefined, "select", "pan", "not-a-real-tool"].forEach((tool) => {
  check(
    `${JSON.stringify(tool)} is not a drag-created tool`,
    creationDrag.isDragCreationTool(tool) === false,
  );
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
