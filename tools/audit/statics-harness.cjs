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
const dir = path.join(projectRoot, "js", "engineering-drawing");

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
  require(path.join(dir, name));
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
  dir,
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