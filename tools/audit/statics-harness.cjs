/*
 * STATICS ENGINEERING AUDIT HARNESS
 *
 * Loads the real engineering modules (no canvas) and drives the model layer
 * the way the application does, so each Statics feature's authoritative data,
 * derived calculations, dependencies and persistence can be checked.
 *
 * Verification aid, not part of the application.
 */
const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..", "..");
const { locate } = require("../../tests/helpers/source-path.cjs");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.window.crypto = { randomUUID: () => "audit-uuid" };
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.window.requestAnimationFrame = global.requestAnimationFrame;

const LOAD = [
  "quantities.js",
  "dimensions.js",
  "measurement-core.js",
  "diagram-equations.js",
  "body-frames.js",
  "load-profile.js",
  "feature-geometry.js",
  "drawing-state.js",
  "analysis-dependencies.js",
  "annotation-model.js",
  "renderer.js",
];

for (const name of LOAD) {
  require(locate(name));
}

for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggDiagramEquations",
  "enggAnalysisDependencies",
  "enggLoadProfile",
  "enggFeatureGeometry",
  "enggBodyFrames",
  "enggAnnotationModel",
  "enggQuantities",
]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

module.exports = {
  dom,
  /*
   * The source lookup, not a directory.
   *
   * This used to be `dir` - one flat folder under js/ - and a consumer
   * did path.join(dir, "x.js"). The sources are organised by ownership
   * now, so the harness hands out the LOOKUP instead: locate("x.js") is
   * the same call shape and finds the file wherever it lives.
   */
  locate,
  state: global.window.enggDrawingState,
  renderer: global.window.enggDrawingRenderer,
  deps: global.window.enggAnalysisDependencies,
  equations: global.window.enggDiagramEquations,
  profile: global.window.enggLoadProfile,
  geometry: global.window.enggFeatureGeometry,
  frames: global.window.enggBodyFrames,
  annotations: global.window.enggAnnotationModel,
  quantities: global.window.enggQuantities,
  projectRoot,
};