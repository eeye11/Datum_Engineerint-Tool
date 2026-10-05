/*
 * Traces what a diameter dimension actually produces, to find why
 * radialGraphics returns null for a circle that clearly has a radius.
 */
global.window = { crypto: { randomUUID: () => "u" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = { polygonVertices: () => [] };
global.window.enggFeatureGeometry = { rectangleCorners: () => [] };
require("../js/engineering-drawing/dimension-model.js");

const model = global.window.enggDimensionModel;
const m = global.window.enggMeasurement;

const circle = {
  id: "c1",
  type: "circle",
  geometry: { center: { x: 0, y: 0 }, radius: 25 },
  style: {},
  metadata: {},
};

const state = { objects: [circle], scale: { mmPerUnit: 1, unit: "mm" } };

console.log("anchors offered:", JSON.stringify(m.anchorOptions(circle)));
console.log(
  "resolveAnchor center:",
  JSON.stringify(m.resolveAnchor(circle, "center")),
);
console.log(
  "resolveAnchor position:",
  JSON.stringify(m.resolveAnchor(circle, "position")),
);
console.log("featureRadius:", model.featureRadius(circle));
console.log(
  "measurementFor:",
  JSON.stringify(
    model.measurementFor(
      {
        dimensionType: "diameter",
        sourceRefs: [{ kind: "between", featureId: "c1", anchor: "east" }],
      },
      state,
    ),
  ),
);

const dimension = model.createDimension({
  dimensionType: "diameter",
  refs: [{ featureId: "c1", anchor: "east" }],
  placement: { x: 25, y: 25 },
});

console.log("sourceRefs:", JSON.stringify(dimension.sourceRefs));
console.log(
  "measurePoints:",
  JSON.stringify(model.measurePoints(dimension, state)),
);
console.log(
  "graphicsFor:",
  JSON.stringify(model.graphicsFor(dimension, state)),
);
