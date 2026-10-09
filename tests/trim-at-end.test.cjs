/*
 * ========================================================
 * TRIM: A CROSSING AT AN END DOES NOT CUT ANYTHING
 * ========================================================
 *
 * THE DEFECT THIS PINS, measured with a probe rather than reasoned about.
 *
 * `intersectionsAlongLine` recorded EVERY crossing it found, including one
 * sitting exactly on the line's own endpoint. A crossing AT an end does not
 * divide the line - the line stops there, so there is no piece beyond it to
 * remove. Recorded anyway, the stops read `[start, start, end]`: the
 * zero-length first piece was skipped, so the WHOLE LINE became the "last
 * piece", and a trim near that end shortened the line to its own start.
 *
 * A click that should have done nothing changed the drawing.
 *
 * WHAT IS CORRECT, and what the probe showed:
 *
 *   ONE CROSSING IN THE MIDDLE  divides the line into two pieces. The click
 *                               picks which piece to remove - clicking left of
 *                               the crossing picks the first, right of it the
 *                               last. This was already right; it is pinned here
 *                               so the end-crossing fix cannot break it.
 *
 *   A CROSSING AT AN END        divides nothing, so nothing is trimmed.
 *
 *   NOTHING CROSSING            nothing is trimmed, and the message says so
 *                               rather than claiming "Trimmed".
 *
 * A TRIM IS A CUT, NEVER A DELETE. The feature survives every one of these.
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

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div class="drawing-canvas"></div>
     <div id="drawingProperties"></div>
     <div id="drawingToolMessage"></div>
     <div id="drawingCoordinates"></div>
     <div id="drawingZoomValue"></div>
     <div id="drawingToolHeading"></div>
     <div id="drawingToolList"></div>
     <div id="drawingFeaturesBack"></div>
   </body></html>`,
  { pretendToBeVisual: true, url: "https://datum.test/" },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Element = dom.window.Element;
global.window.crypto = { randomUUID: () => "trim-uuid" };

[
  "measurement-core.js",
  "quantities.js",
  "dimension-model.js",
  "annotation-model.js",
  "diagram-equations.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
  "renderer.js",
].forEach((name) => require(modulePath(name)));

const state = require(modulePath("drawing-state.js")).default;
const editorState = require(modulePath("editor-state.js"));
const transforms = require(modulePath("transforms.js"));

const drawing = editorState.drawingState;
const F = state.geometryFactories;

const message = () =>
  document.getElementById("drawingToolMessage")?.textContent ?? "";

const lengthOf = (object) =>
  Math.hypot(
    object.geometry.end.x - object.geometry.start.x,
    object.geometry.end.y - object.geometry.start.y,
  );

/* A line at y=0 from x=0 to x=100, crossed by a vertical line at `at`. */
function scene(at) {
  const line = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  const cutter = F.line({ x: at, y: -50 }, { x: at, y: 50 });

  const stored = state.addObject(drawing, line);
  const storedCutter = state.addObject(drawing, cutter);

  drawing.objects = [stored, storedCutter];
  drawing.selection.selectedObjectIds = [];
  state.clearInteraction(drawing);

  return stored;
}

console.log("\n  a crossing in the MIDDLE divides the line\n");

{
  const line = scene(50);

  const left = transforms.trimSegmentAt(line, drawing.objects, { x: 20, y: 0 });

  check(
    "clicking left of the crossing picks the FIRST piece",
    left && left.touchesStart === true && left.touchesEnd === false,
    JSON.stringify(left),
  );

  check(
    "running from the line's start to the crossing",
    left.from.x === 0 && left.to.x === 50,
    `${left.from.x} -> ${left.to.x}`,
  );

  const right = transforms.trimSegmentAt(line, drawing.objects, {
    x: 80,
    y: 0,
  });

  check(
    "clicking right of it picks the LAST piece",
    right && right.touchesEnd === true && right.touchesStart === false,
    JSON.stringify(right),
  );

  check(
    "running from the crossing to the line's end",
    right.from.x === 50 && right.to.x === 100,
    `${right.from.x} -> ${right.to.x}`,
  );

  /*
   * THE POINT: a click is inside exactly one piece, so a piece never claims
   * both ends - which is why the caller's three branches always find a match.
   */
  check(
    "so no piece claims both ends at once",
    !(left.touchesStart && left.touchesEnd) &&
      !(right.touchesStart && right.touchesEnd),
  );
}

console.log("\n  clicking LEFT of the crossing removes the run before it\n");

{
  const line = scene(50);

  const result = transforms.trimSegmentAtCursor(
    line,
    { x: 20, y: 0 },
    drawing.objects,
  );

  check("the trim reports that it did something", result === true);

  check(
    "the line now begins at the crossing",
    line.geometry.start.x === 50 && line.geometry.start.y === 0,
    JSON.stringify(line.geometry.start),
  );

  check(
    "its far end is untouched",
    line.geometry.end.x === 100,
    String(line.geometry.end.x),
  );

  /*
   * A TRIM IS A CUT, NOT A DELETE. The feature is still on the sheet, one piece
   * shorter - never removed because something happened to cross it.
   */
  check(
    "and the line SURVIVES, shorter",
    drawing.objects.some((o) => o.id === line.id) && lengthOf(line) === 50,
    `length ${lengthOf(line)}`,
  );
}

{
  const line = scene(50);

  check(
    "clicking RIGHT of the crossing removes the run after it",
    transforms.trimSegmentAtCursor(line, { x: 80, y: 0 }, drawing.objects) ===
      true && line.geometry.end.x === 50,
    JSON.stringify(line.geometry.end),
  );
}

console.log("\n  a crossing AT AN END cuts NOTHING\n");

{
  const line = scene(0);

  const before = JSON.stringify(line.geometry);

  const result = transforms.trimSegmentAtCursor(
    line,
    { x: 5, y: 0 },
    drawing.objects,
  );

  check(
    "a crossing at the line's start is refused",
    result === false,
    String(result),
  );

  check(
    "so the geometry is left EXACTLY as it was",
    JSON.stringify(line.geometry) === before,
    JSON.stringify(line.geometry),
  );

  check(
    "and the line keeps its full length",
    lengthOf(line) === 100,
    String(lengthOf(line)),
  );
}

{
  const line = scene(100);

  const before = JSON.stringify(line.geometry);

  const result = transforms.trimSegmentAtCursor(
    line,
    { x: 95, y: 0 },
    drawing.objects,
  );

  check(
    "and the same at the line's end",
    result === false && JSON.stringify(line.geometry) === before,
    `${result} / ${JSON.stringify(line.geometry)}`,
  );
}

console.log("\n  nothing crossing is not reported as a trim\n");

{
  const lonely = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  const stored = state.addObject(drawing, lonely);

  drawing.objects = [stored];
  drawing.selection.selectedObjectIds = [];

  const before = JSON.stringify(stored.geometry);

  const result = transforms.trimSegmentAtCursor(
    stored,
    { x: 50, y: 0 },
    drawing.objects,
  );

  check("it reports that nothing happened", result === false);

  check(
    "the geometry is untouched",
    JSON.stringify(stored.geometry) === before,
  );

  check(
    "and the message does not claim a trim",
    !/^trimmed$/i.test(message().trim()),
    JSON.stringify(message()),
  );
}

console.log("\n  and a real trim says so\n");

{
  const line = scene(50);

  transforms.trimSegmentAtCursor(line, { x: 20, y: 0 }, drawing.objects);

  check(
    "a successful trim is reported",
    /trimmed/i.test(message()),
    JSON.stringify(message()),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
