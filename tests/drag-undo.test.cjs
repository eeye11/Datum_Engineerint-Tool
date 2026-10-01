/*
 * A DRAG IS UNDOABLE, WHATEVER IT MOVED.
 *
 * This is a structural test, and it is worth being honest about why.
 *
 * The behaviour it guards lives in the editor's drag machinery, which
 * needs a live canvas, so it cannot be exercised from Node. It IS
 * exercised in the browser - an annotation is dragged, the source
 * feature is confirmed unmoved, the link is confirmed intact, and undo
 * is confirmed to put the label back - but that proof is not a
 * regression test, because nobody re-runs it.
 *
 * So the shape of the code is pinned here instead.
 *
 * THE BUG
 * -------
 * The drag machinery snapshotted `object.geometry` and restored it on
 * undo. That is correct for a shape and silently wrong for everything
 * else, because plenty of features are not stored in geometry at all:
 *
 *   - an annotation's position is `placement`
 *   - a dimension's chosen offset is `placement`
 *
 * Moving either wrote to those fields, the undo entry held only
 * geometry, and restoring it left the moved object exactly where the
 * student had put it. Undo appeared to work - the drawing redrew, the
 * history advanced - while doing nothing to the thing the student was
 * trying to undo.
 *
 * Nothing threw and nothing looked wrong. That is the whole reason it
 * is pinned structurally.
 */
const fs = require("fs");
const path = require("path");

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

const source = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "js",
    "engineering-drawing",
    "drawing.js"
  ),
  "utf8"
);

const section = (name) => {
  const start = source.indexOf(`function ${name}`);
  if (start === -1) {
    return "";
  }
  const next = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, next === -1 ? source.length : next);
};

console.log("\nThe drag snapshots the whole object");

const begin = section("beginManipulationDrag");

check("beginManipulationDrag exists", begin.length > 0);

check(
  "it snapshots the object",
  /originals:\s*\{\s*\[hit\.object\.id\]:\s*JSON\.parse\(/s.test(begin),
  "no originals entry keyed by the object id"
);

check(
  "and does NOT snapshot only the geometry",
  !/JSON\.stringify\(\s*hit\.object\.geometry\s*\)/s.test(begin),
  "the snapshot is geometry-only, so a move of `placement` cannot be undone"
);

console.log("\nFinishing a drag restores the whole object");

const finish = section("finishManipulationDrag");

check("finishManipulationDrag exists", finish.length > 0);

check(
  "the undo entry spreads the whole snapshot",
  /\.\.\.JSON\.parse\(\s*JSON\.stringify\(\s*drag\.originals\[/s.test(finish),
  "the undo entry does not spread the snapshot"
);

check(
  "and does not restore geometry alone",
  !/geometry:\s*JSON\.parse\(/s.test(finish),
  "the undo entry restores only `geometry`, leaving `placement` moved"
);

console.log("\nCancelling a drag restores it too");

const cancel = section("cancelManipulationDrag");

check("cancelManipulationDrag exists", cancel.length > 0);

check(
  "the rollback spreads the whole snapshot",
  /\.\.\.JSON\.parse\(\s*JSON\.stringify\(\s*drag\.originals\[/s.test(cancel),
  "the rollback restores only geometry, so Escape would leave a moved label in place"
);

console.log("\nAnd identity and style are never rolled back");

/*
 * Both restores take a deep clone of the whole object, which would also
 * restore a stale id or style if one were captured before a later edit.
 * Re-keying the object to its live id is what keeps a rolled-back
 * feature attached to everything that points at it.
 */
[finish, cancel].forEach((code, index) => {
  const label = index === 0 ? "finish" : "cancel";

  check(
    `${label} keeps the live id`,
    /id:\s*object\.id/.test(code),
    "the restored object keeps a snapshotted id, which can detach it"
  );

  check(
    `${label} keeps the live style`,
    /style:\s*object\.style/.test(code)
  );
});

console.log("\nPlot labels and the legend have independent editing targets");

const graphSelection = section("graphPlotObjectIds");
const annotationProperties = section("featurePropertyMarkup");
const propertyBindings = section("bindFeaturePropertyControls");
const plotBuilder = section("addGraphPlotToDrawing");
const handlePicking = section("handleAtPoint");
const manipulation = section("beginManipulationDrag");
const applyManipulation = section("applyManipulation");

check(
  "a plot label selects independently",
  /graphPlotRole\s*===\s*["']label["'][\s\S]*?return\s+\[object\.id\]/.test(graphSelection),
  "plot labels still select the entire graph"
);

check(
  "legend members share a draggable subgroup",
  /graphPlotGroup\s*===\s*graphPlotGroup/.test(graphSelection) &&
    /graphPlotGroup:\s*["']legend["']/.test(source),
  "the legend background, swatches and labels are not grouped"
);

check(
  "the legend subgroup has independent frame resize handles",
  /graphPlotGroupRole:\s*["']frame["']/.test(source) &&
    /wholeGroupSelected[\s\S]*?graphPlotGroupRole\s*===\s*["']frame["'][\s\S]*?boundsOfObjects\([\s\S]*?frame\s*\?\s*\[frame\]\s*:\s*resizeObjects/.test(handlePicking),
  "legend resizing still depends on selecting the whole plot"
);

check(
  "plot labels expose editable text",
  /data-annotation-text/.test(annotationProperties) &&
    /data-annotation-text/.test(propertyBindings),
  "plot label text has no property editor"
);

check(
  "endpoint labels have no leader lines",
  !/endpoint-label-leader|\$\{name\} leader/.test(plotBuilder),
  "endpoint labels still create a line back to the plotted point"
);

check(
  "press-dragging a plot label selects and snapshots it",
  /graphPlotRole\s*===\s*["']label["'][\s\S]*?selectObjects\([\s\S]*?originals:\s*\{[\s\S]*?JSON\.parse\(JSON\.stringify\(object\)\)/.test(manipulation),
  "an unselected plot label cannot begin a drag with a whole-object snapshot"
);

check(
  "a selected plot label wins over graph resize handles",
  /pointedObject\?\.engineering\?\.graphPlotRole\s*===\s*["']label["'][\s\S]*?return\s*\{[\s\S]*?object:\s*pointedObject/.test(handlePicking),
  "graph-corner handles are checked before selected plot labels"
);

check(
  "plot-label text hit-testing runs before handle picking",
  /const plotLabel\s*=\s*\[\.\.\.drawingState\.objects\]\.reverse\(\)\.find[\s\S]*?annotationContainsPoint\(object, point\)[\s\S]*?const hit\s*=\s*handleAtPoint/.test(manipulation),
  "resize handles can claim a press on plot-label text"
);

check(
  "moving a plot label changes only its own placement",
  /drag\.kind\s*===\s*["']plot-label["'][\s\S]*?original\.placement\.x\s*\+\s*point\.x\s*-\s*drag\.start\.x[\s\S]*?original\.placement\.y\s*\+\s*point\.y\s*-\s*drag\.start\.y/.test(applyManipulation),
  "label dragging still routes through graph-group translation"
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
