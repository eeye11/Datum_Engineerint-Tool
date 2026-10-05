const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

const dom = new JSDOM(
  '<!doctype html><html><body><div id="canvas"></div></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.window.requestAnimationFrame = global.requestAnimationFrame;
global.window.cancelAnimationFrame = (id) => clearTimeout(id);
global.window.crypto = { randomUUID: () => "render-uuid" };

for (const name of [
  "measurement-core.js",
  "quantities.js",
  "dimension-model.js",
  "annotation-model.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
  "renderer.js",
]) {
  require(path.join(projectRoot, "js", "engineering-drawing", name));
}

for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggLoadProfile",
  "enggFeatureGeometry",
  "enggBodyFrames",
  "enggDimensionModel",
  "enggQuantities",
  "enggMeasurement",
  "enggAnnotationModel",
]) {
  if (global.window[name]) global[name] = global.window[name];
}

const renderer = global.window.enggDrawingRenderer;
const profile = global.window.enggLoadProfile;

function baseState(objects) {
  return {
    objects,
    camera: { zoom: 1, panX: 0, panY: 0 },
    grid: { visible: false, spacing: 5 },
    snap: { enabled: false },
    statics: { vectorScale: 1 },
    display: { showMagnitudes: false, showUnits: true },
    styleDefaults: { stroke: "#000000", lineWidth: 0.5, lineType: "solid" },
    selection: {
      selectedObjectIds: [],
      boxSelectionIds: [],
      hoveredObjectId: null,
    },
    interaction: { phase: "idle", preview: null, previewObjects: [] },
  };
}

function render(geometry) {
  const host = global.document.createElement("div");
  global.document.body.appendChild(host);
  renderer.renderDrawing(
    baseState([
      {
        id: "force-1",
        type: "force",
        geometry,
        style: { stroke: "#000000", lineWidth: 1 },
        engineering: { discipline: "statics" },
      },
    ]),
    host,
  );
  const out = [...host.querySelectorAll("line, path, polygon")].map((el) => ({
    tag: el.tagName,
    x1: el.getAttribute("x1"),
    y1: el.getAttribute("y1"),
    x2: el.getAttribute("x2"),
    y2: el.getAttribute("y2"),
    d: el.getAttribute("d"),
    points: el.getAttribute("points"),
  }));
  host.remove();
  return out;
}

const geometry = {
  start: { x: -100, y: 0 },
  position: { x: -100, y: 0 },
  end: { x: 100, y: 0 },
  magnitude: 200,
  angle: 0,
  forceX: 200,
  forceY: 0,
};

console.log("BEFORE", JSON.stringify(render(geometry), null, 1));
profile.reverseForceDirection(geometry);
console.log("AFTER ", JSON.stringify(render(geometry), null, 1));
