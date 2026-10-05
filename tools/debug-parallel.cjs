/*
 * Why two parallel lines are being offered an included angle.
 */
global.window = { crypto: { randomUUID: () => "u" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = { polygonVertices: () => [] };
global.window.enggFeatureGeometry = { rectangleCorners: () => [] };
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/smart-dimension.js");

const smart = global.window.enggSmartDimension;

const a = {
  id: "l1",
  type: "line",
  geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  style: {},
};
const b = {
  id: "l3",
  type: "line",
  geometry: { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } },
  style: {},
};

const spanA = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
const spanB = { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } };

console.log("includedAngle:", smart.includedAngle(spanA, spanB));
console.log("pairCandidates:", JSON.stringify(smart.pairCandidates(a, b)));
console.log(
  "propose:",
  JSON.stringify(smart.propose([a, b], { objects: [a, b] })),
);
