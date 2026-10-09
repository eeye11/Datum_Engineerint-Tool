/*
 * ========================================================
 * A CHILD OF A BODY IS POSITIONED ON ONE AXIS
 * ========================================================
 *
 * A feature attached to a body is placed ALONG that body: one number, measured
 * on the member, whose height and orientation follow from the member and the
 * feature's own direction. So the Features panel offers the Relative To row set
 * and NOTHING ELSE - there is no second coordinate to set, and an absolute Y
 * field used to invite a value that moved the feature across its own member,
 * which the model does not store and the renderer does not honour.
 *
 * A feature with NO parent genuinely has two coordinates - it is somewhere on
 * the sheet, not somewhere on a member - so it keeps the absolute X and Y.
 *
 * This pins both halves, and the absence of any leftover empty Y row.
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

for (const name of [
  "quantities.js",
  "dimensions.js",
  "measurement-core.js",
  "annotation-model.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
]) {
  require(modulePath(name));
}

const state = require(modulePath("drawing-state.js")).default;

const editorState = require(modulePath("editor-state.js"));

/* The editor's live document, which the relative rows read the parent from. */
const drawing = editorState.drawingState;

const relative = require(modulePath("relative-coordinates.js"));

const propertyPanel = require(
  modulePath("property-panel.js")
).default;

const F = state.geometryFactories;

/*
 * The row helpers the panel builder passes in, taken from the shared module so
 * the rows produced here are the rows the real panel produces.
 */
const helpers = {
  coordinate: (label, key, value, unit, isLength) =>
    propertyPanel.scalar({
      label,
      key,
      value,
      unit,
    }),
  section: (label) => `<!--section:${label}-->`,
};

function reset(objects) {
  drawing.objects = objects;
  drawing.scale = null;
  drawing.selection.selectedObjectIds = [];
  drawing.selection.boxSelectionIds = [];
}

console.log("\n  a child of a body offers the relative row, NOT an absolute Y\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 200, y: 0 });

  const force = F.forceFromMagnitude({ x: 80, y: 0 }, 100, -90, {});
  force.parentId = beam.id;

  reset([beam, force]);

  const rows = relative.absolutePositionRows(force, helpers);

  check(
    "no absolute position rows are offered for an attached force",
    rows.length === 0,
    JSON.stringify(rows),
  );

  /*
   * And nothing is left behind: no disabled field, no empty row. The heading
   * went with the fields because the helper returns nothing at all.
   */
  check(
    "and nothing is left behind - not even a heading",
    !rows.includes("<!--section:POSITION-->"),
  );
}

console.log("\n  the relative row IS still offered, and is a real world distance\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 200, y: 0 });

  const force = F.forceFromMagnitude({ x: 80, y: 0 }, 100, -90, {});
  force.parentId = beam.id;

  reset([beam, force]);

  const markup = relative.relativeCoordinateRows(
    force,
    "APPLICATION POINT",
    helpers,
  );

  check(
    "the relative rows name the parent",
    markup.includes("Relative to") && markup.includes(beam.name || "Beam"),
    markup.slice(0, 200),
  );

  check(
    "and report the distance along the member",
    markup.includes("Along Body"),
  );

  check(
    "as a physical length, in the sheet's units",
    /mm/.test(markup),
  );
}

console.log("\n  a FREE feature keeps BOTH coordinates\n");

{
  const force = F.forceFromMagnitude({ x: 40, y: 25 }, 100, 30, {});

  reset([force]);

  const rows = relative.absolutePositionRows(force, helpers).join("");

  check(
    "an unattached force is offered its X",
    rows.includes("position.x"),
  );

  check(
    "and its Y, because it genuinely has two coordinates",
    rows.includes("position.y"),
  );

  check(
    "under a POSITION heading",
    rows.includes("<!--section:POSITION-->"),
  );
}

console.log("\n  a feature whose parent is GONE keeps its own position\n");

{
  const force = F.forceFromMagnitude({ x: 40, y: 25 }, 100, 30, {});

  /* A parent id that resolves to nothing. */
  force.parentId = "a-beam-that-was-deleted";

  reset([force]);

  const rows = relative.absolutePositionRows(force, helpers).join("");

  check(
    "the absolute pair is offered again - there is no axis to measure along",
    rows.includes("position.x") && rows.includes("position.y"),
  );

  check(
    "and the relative rows render nothing",
    relative.relativeCoordinateRows(force, "POSITION", helpers) === "",
  );
}

console.log("\n  the rule is the PARENT, not the feature type\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 200, y: 0 });
  const column = F.beam({ x: 0, y: 0 }, { x: 0, y: 200 });

  /*
   * The same kind of feature - a moment - is offered differently depending on
   * whether it is on a body, which is exactly the point: what it is does not
   * decide its coordinates, where it lives does.
   */
  const attached = F.moment({ x: 50, y: 0 }, 50, false, {});
  attached.parentId = beam.id;

  const free = F.moment({ x: 50, y: 0 }, 50, false, {});

  reset([beam, column, attached, free]);

  check(
    "an ATTACHED moment gets no absolute rows",
    relative.absolutePositionRows(attached, helpers).length === 0,
  );

  check(
    "while a FREE moment does",
    relative.absolutePositionRows(free, helpers).length > 0,
  );
}

console.log("\n  the RENDERED PANEL has no absolute Y for an attached force\n");

{
  const markupModule = require(
    modulePath("feature-panel-markup.js"),
  );

  const beam = F.beam({ x: 0, y: 0 }, { x: 200, y: 0 });

  const attachedForce = F.forceFromMagnitude({ x: 80, y: 0 }, 100, -90, {});
  attachedForce.parentId = beam.id;

  const freeForce = F.forceFromMagnitude({ x: 40, y: 25 }, 100, 30, {});

  reset([beam, attachedForce, freeForce]);

  const attachedPanel = markupModule.featurePropertyMarkup(attachedForce);
  const freePanel = markupModule.featurePropertyMarkup(freeForce);

  /*
   * The panel writes `data-property="position.x"` / `"position.y"` for the
   * absolute ordinates. On the attached force NEITHER should appear; on the free
   * one both should.
   */
  check(
    "the attached force's panel has no absolute Y field",
    !/data-property="position\.y"/.test(attachedPanel),
    "a Y field here would invite a value the model cannot honour",
  );

  check(
    "and no absolute X field either - the relative row is the placement",
    !/data-property="position\.x"/.test(attachedPanel),
  );

  check(
    "but it DOES still name its parent",
    /Relative to/i.test(attachedPanel),
  );

  check(
    "while the FREE force keeps both ordinates",
    /data-property="position\.x"/.test(freePanel) &&
      /data-property="position\.y"/.test(freePanel),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
