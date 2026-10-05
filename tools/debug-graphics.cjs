/*
 * Why graphicsFor returns null for a dimension that clearly resolves.
 */
global.window = { crypto: { randomUUID: () => "u" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = {
  polygonVertices: () => [],
};
global.window.enggFeatureGeometry = {
  rectangleCorners: () => [],
};
require("../js/engineering-drawing/dimension-model.js");

const model = global.window.enggDimensionModel;

const beam = {
  id: "beam-1",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    depth: 20,
  },
  style: {},
  metadata: {},
};

const state = { objects: [beam], scale: { mmPerUnit: 1, unit: "mm" } };

const span = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "beam-1", anchor: "start" },
    { featureId: "beam-1", anchor: "end" },
  ],
  placement: { x: 50, y: 30 },
});

console.log(
  "measurementFor:",
  JSON.stringify(model.measurementFor(span, state)),
);
console.log(
  "formatMeasurement:",
  JSON.stringify(model.formatMeasurement(span, state)),
);
console.log("measurePoints:", JSON.stringify(model.measurePoints(span, state)));
console.log("graphicsFor:", JSON.stringify(model.graphicsFor(span, state)));
