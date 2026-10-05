/*
 * Why a shaft is not offered its diameter.
 */
global.window = { crypto: { randomUUID: () => "u" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = { polygonVertices: () => [] };
global.window.enggFeatureGeometry = { rectangleCorners: () => [] };
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/smart-dimension.js");

const m = global.window.enggMeasurement;
const smart = global.window.enggSmartDimension;

const shaft = {
  id: "s1",
  name: "s1",
  type: "shaft",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 500, y: 0 },
    diameter: 40,
  },
  style: {},
  metadata: {},
};

console.log(
  "candidates from the measurement layer:",
  JSON.stringify(m.dimensionCandidates(shaft)),
);
console.log("anchors offered:", JSON.stringify(m.anchorOptions(shaft)));
console.log("smart.candidatesFor:", JSON.stringify(smart.candidatesFor(shaft)));
console.log("isAvailable diameter:", smart.isAvailable(shaft, "diameter"));
console.log("isAvailable linear:", smart.isAvailable(shaft, "linear"));
console.log(
  "TWO_MEASUREMENT_TYPES.shaft:",
  JSON.stringify(smart.TWO_MEASUREMENT_TYPES.shaft),
);
console.log(
  "propose:",
  JSON.stringify(smart.propose([shaft], { objects: [shaft] })),
);
