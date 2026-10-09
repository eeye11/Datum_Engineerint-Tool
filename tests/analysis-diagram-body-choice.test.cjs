/*
 * ========================================================
 * A DIAGRAM IS NEVER ATTACHED TO A MEMBER NOBODY PICKED
 * ========================================================
 *
 * The Analysis Plot and Sketch tools ask for TWO things in order: which member
 * the diagram belongs to, then how far from it the diagram sits. The reported
 * experience was that a plot needed "repeated clicks around the canvas" before
 * it appeared.
 *
 * THE CAUSE was a fallback in the body-choosing click:
 *
 *     const body = analysisSourceBody([ what was clicked ]) ||
 *                  analysisSourceBody(selectedStaticsFeatures());
 *
 * `selectedStaticsFeatures()` returns EVERY Statics feature when nothing is
 * selected, so a click on empty space silently adopted the only member on the
 * sheet. The first click therefore "did nothing" as far as the student could
 * see - it had quietly picked a body - and the SECOND click appeared to be the
 * one that worked. Worse, the diagram was attached to a member that was never
 * chosen, which the diagram rules forbid outright.
 *
 * The body now comes from the click ALONE. This pins that, and the two-step
 * workflow it leaves behind.
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
global.window.crypto = { randomUUID: () => "plot-uuid" };

[ "measurement-core.js", "quantities.js", "dimension-model.js",
  "annotation-model.js", "diagram-equations.js", "load-profile.js",
  "body-frames.js", "feature-geometry.js", "drawing-state.js", "renderer.js",
].forEach((name) => require(modulePath(name)));

[ "enggDrawingState", "enggLoadProfile", "enggFeatureGeometry", "enggBodyFrames",
  "enggDimensionModel", "enggQuantities", "enggMeasurement", "enggAnnotationModel",
  "enggAnalysisDependencies",
].forEach((name) => {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
});

const fs = require("fs");
const { locate } = require("./helpers/source-path.cjs");

const state = require(modulePath("drawing-state.js")).default;
const editorState = require(modulePath("editor-state.js"));
const analysis = require(modulePath("analysis-tools.js"));
const creation = require(modulePath("geometry-creation.js"));

const drawing = editorState.drawingState;
const F = state.geometryFactories;

const source = fs.readFileSync(locate("geometry-creation.js"), "utf8");

/*
 * COMMENTS STRIPPED before the source is inspected. The fix explains itself in a
 * comment that names the very call it removed, so a naive search would find the
 * explanation and report the bug as still present.
 */
const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

console.log("\n  the body-choosing click reads ONLY what was clicked\n");

check(
  "no sheet-wide fallback is consulted when naming a body",
  !/analysisSourceBody\(\s*selectedStaticsFeatures\(\)\s*\)/.test(sourceCode),
  "that fallback returns EVERY feature when nothing is selected",
);

check(
  "the resolution is built from the snap candidate or the click point alone",
  /snappedId[\s\S]{0,400}?:\s*\[objectAtPoint\(point\)\]/.test(sourceCode),
);

console.log("\n  and `selectedStaticsFeatures` really is sheet-wide when empty\n");

{
  /*
   * A Statics feature, identified the way the model identifies one - by its
   * `engineering.discipline`. A bare geometry factory does not carry that, so a
   * fixture without it is not a Statics feature at all and the helper correctly
   * finds none.
   */
  const staticsBeam = (start, end) => {
    const beam = F.beam(start, end);

    beam.engineering = {
      plane: "XY",
      discipline: "statics",
      staticsType: "beam",
    };

    return beam;
  };

  drawing.objects = [
    staticsBeam({ x: -100, y: 0 }, { x: 100, y: 0 }),
    staticsBeam({ x: -100, y: 100 }, { x: 100, y: 100 }),
  ];
  drawing.selection.selectedObjectIds = [];

  const all = analysis.selectedStaticsFeatures();

  check(
    "with an empty selection it returns every Statics feature",
    all.length === 2,
    `returned ${all.length}`,
  );

  /*
   * WHICH IS EXACTLY WHY IT MUST NOT BE USED TO CHOOSE A DIAGRAM'S MEMBER: a
   * caller that falls back to it adopts a member nobody picked.
   */
  check(
    "so it is unfit for choosing a diagram's member",
    all.length > 1,
  );
}

console.log("\n  the two-step workflow is what remains\n");

{
  const beam = F.beam({ x: -150, y: 0 }, { x: 150, y: 0 });

  beam.engineering = { plane: "XY", discipline: "statics", staticsType: "beam" };

  drawing.objects = [beam];
  drawing.selection.selectedObjectIds = [];
  state.clearInteraction(drawing);

  /* ARM: with nothing selected the tool waits and says what it needs. */
  analysis.beginAnalysisDiagram("bending-moment-diagram");

  check(
    "arming with nothing selected leaves the tool WAITING for a body",
    drawing.interaction.phase === "analysis-axis" &&
      drawing.interaction.sourceId === null,
    `phase=${drawing.interaction.phase} sourceId=${drawing.interaction.sourceId}`,
  );

  check(
    "and says which member it needs",
    /select the beam/i.test(
      document.getElementById("drawingToolMessage").textContent,
    ),
  );

  /*
   * A CLICK FAR FROM ANY MEMBER. The beam runs along y = 0 from x = -150 to
   * x = 150, so a point at (0, 400) is nowhere near it - the same "clicked
   * empty space" that used to adopt the beam by accident.
   */
  creation.beginOrCompleteGeometry({
    effectiveConstructionPoint: { x: 0, y: 400 },
    rawPointerPoint: { x: 0, y: 400 },
    snapCandidate: null,
  });

  check(
    "a click that names no member does NOT set a source",
    drawing.interaction.sourceId === null,
    `sourceId = ${drawing.interaction.sourceId}`,
  );

  check(
    "and the tool stays in its waiting state, ready for a real click",
    drawing.interaction.phase === "analysis-axis",
  );

  check(
    "with a message that explains the miss",
    /not a beam/i.test(
      document.getElementById("drawingToolMessage").textContent,
    ),
    document.getElementById("drawingToolMessage").textContent,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
