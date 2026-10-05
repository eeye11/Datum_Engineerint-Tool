/*
 * Two parallel lines were offered an included angle of zero.
 *
 * pairCandidates' guard reads correctly and includedAngle correctly
 * returns 0, so the branch taken must be the FALLBACK - which means
 * twoPointSpan is not recognising these lines as spans, and the
 * measurement layer's own pairCandidates then offered "angular" for a
 * pair of points with no direction between them.
 *
 * That is the real defect, and it is in the measurement layer rather
 * than here: twoPointSpan decides what has a span, and if it rejects
 * an ordinary line then every consumer of a span is wrong - not just
 * the angle. Worth seeing exactly what it does with a line.
 */
global.window = { crypto: { randomUUID: () => "u" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = { polygonVertices: () => [] };
global.window.enggFeatureGeometry = { rectangleCorners: () => [] };

const m = global.window.enggMeasurement;

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

console.log("twoPointSpan(a):", JSON.stringify(m.twoPointSpan(a)));
console.log("twoPointSpan(b):", JSON.stringify(m.twoPointSpan(b)));
console.log("layer pairCandidates:", JSON.stringify(m.pairCandidates(a, b)));
console.log("anchors for a:", JSON.stringify(m.anchorOptions(a)));
console.log(
  "resolveAnchor start:",
  JSON.stringify(m.resolveAnchor(a, "start")),
);
