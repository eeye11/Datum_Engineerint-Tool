/*
 * ========================================================
 * SFD / BMD PREREQUISITES, SAID SPECIFICALLY
 * ========================================================
 *
 * A diagram measures a MEMBER. When it cannot start, the student is in one of
 * three different situations and the fix is different in each - so the tool must
 * say which one, not repeat a single instruction that only fits one of them.
 *
 *   NO MEMBER ON THE SHEET     "No suitable beam found. Create one first..."
 *   A MEMBER EXISTS, NONE PICKED  "Select the beam this diagram belongs to..."
 *   THE CLICK WAS NOT A MEMBER   "The selected feature is not a beam..."
 *
 * And in every case the tool must NOT invent a beam, must leave the drawing
 * untouched, and must stay usable so the student can try again.
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
     <button id="drawingUndo"></button>
     <button id="drawingRedo"></button>
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
global.window.crypto = { randomUUID: () => "sfd-uuid" };

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

[
  "enggDrawingState",
  "enggLoadProfile",
  "enggFeatureGeometry",
  "enggBodyFrames",
  "enggDimensionModel",
  "enggQuantities",
  "enggMeasurement",
  "enggAnnotationModel",
  "enggAnalysisDependencies",
].forEach((name) => {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
});

const state = require(modulePath("drawing-state.js")).default;
const editorState = require(modulePath("editor-state.js"));
const analysis = require(modulePath("analysis-tools.js"));

const drawing = editorState.drawingState;
const F = state.geometryFactories;

function reset(objects) {
  drawing.objects = objects;
  drawing.selection.selectedObjectIds = [];
  drawing.selection.boxSelectionIds = [];
  state.clearInteraction(drawing);
}

const toast = () =>
  document.getElementById("drawingToolMessage")?.textContent ?? "";

console.log("\n  NO member on the sheet\n");

{
  reset([]);

  const message = analysis.diagramPrerequisiteMessage(null, true);

  check(
    "the message tells the student to CREATE one",
    /no suitable beam found/i.test(message) && /create/i.test(message),
    message,
  );

  check(
    "and it names what to draw",
    /beam/i.test(message) && /truss|cable|shaft/i.test(message),
    message,
  );

  check(
    "it is NOT the 'select one' wording, which would be impossible to follow",
    !/^select the beam/i.test(message),
  );
}

console.log("\n  a member EXISTS but nothing is selected\n");

{
  reset([F.beam({ x: -100, y: 0 }, { x: 100, y: 0 })]);

  const message = analysis.diagramPrerequisiteMessage(null, true);

  check(
    "the message tells the student to SELECT it",
    /select the beam/i.test(message),
    message,
  );

  check(
    "and does not tell them to create a beam that already exists",
    !/create a beam/i.test(message),
  );
}

console.log("\n  the selection is not a member\n");

{
  reset([
    F.beam({ x: -100, y: 0 }, { x: 100, y: 0 }),
    F.forceFromMagnitude({ x: 0, y: 0 }, 100, 90, {}),
  ]);

  const message = analysis.diagramPrerequisiteMessage(null, false);

  check(
    "the message says the SELECTION is the problem",
    /selected feature is not a beam/i.test(message),
    message,
  );

  check(
    "and still says what to select instead",
    /select the beam/i.test(message),
  );
}

console.log("\n  a valid source needs no message at all\n");

{
  const beam = F.beam({ x: -100, y: 0 }, { x: 100, y: 0 });

  reset([beam]);

  check(
    "a resolved member produces no prerequisite message",
    analysis.diagramPrerequisiteMessage(beam, true) === null,
  );
}

console.log("\n  arming the tool says the right thing up front\n");

{
  reset([]);

  const empty = analysis.analysisDiagramIntroMessage(null);

  check(
    "with no beam, arming tells them to create one",
    /no suitable beam found/i.test(empty),
    empty,
  );

  const beam = F.beam({ x: 0, y: 0 }, { x: 100, y: 0 });

  reset([beam]);

  const withSource = analysis.analysisDiagramIntroMessage(beam);

  check(
    "with a source, arming describes the PLACEMENT step instead",
    /position the diagram/i.test(withSource),
    withSource,
  );
}

console.log("\n  and the tool does NOT invent a beam\n");

{
  const force = F.forceFromMagnitude({ x: 0, y: 0 }, 100, 90, {});

  reset([force]);

  /*
   * `analysisSourceBody` is the one reader of "what did the student point at".
   * Given a force with no parent it must answer null - not reach for a beam
   * that happens to be on the sheet.
   */
  check(
    "a non-member with no parent resolves to nothing",
    analysis.analysisSourceBody([force]) === null,
  );

  const beam = F.beam({ x: -100, y: 0 }, { x: 100, y: 0 });

  reset([beam, force]);

  check(
    "and it still resolves to nothing rather than adopting the beam",
    analysis.analysisSourceBody([force]) === null,
    "a diagram must never attach to a member nobody chose",
  );
}

console.log(
  "\n  a FAILED attempt leaves the drawing intact and the tool usable\n",
);

{
  const beam = F.beam({ x: -100, y: 0 }, { x: 100, y: 0 });

  reset([beam]);

  const before = JSON.stringify(drawing.objects);
  const featureCount = drawing.objects.length;

  /* Arm an SFD with no source: it must wait, not build anything. */
  state.setActiveTool(drawing, "shear-force-diagram");

  analysis.beginAnalysisDiagram("shear-force-diagram");

  check(
    "nothing is added to the document",
    drawing.objects.length === featureCount &&
      JSON.stringify(drawing.objects) === before,
  );

  check(
    "and the tool is left WAITING for a click, not stuck",
    drawing.interaction.phase === "analysis-axis" &&
      drawing.interaction.sourceId === null,
    `phase=${drawing.interaction.phase} sourceId=${drawing.interaction.sourceId}`,
  );

  check(
    "with a message that explains what to do",
    toast().length > 0,
    JSON.stringify(toast()),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
