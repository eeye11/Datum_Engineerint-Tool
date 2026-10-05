global.window = { crypto: { randomUUID: () => "u" } };
require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");
require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/smart-dimension.js");
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/drawing-state.js");

const F = global.window.enggDrawingState.geometryFactories;
const M = global.window.enggMeasurement;
const FG = global.window.enggFeatureGeometry;

const r = F.rectangle({ x: 0, y: 0 }, 80, 40);

console.log("geom:", JSON.stringify(r.geometry));
console.log("anchorNames:", JSON.stringify(M.anchorNames(r)));
console.log("anchorOptions:", JSON.stringify(M.anchorOptions(r)));
console.log("rectangleCorners:", typeof FG.rectangleCorners);
try {
  console.log(
    "corners(r):",
    JSON.stringify(FG.rectangleCorners ? FG.rectangleCorners(r) : null),
  );
} catch (e) {
  console.log("corners(r) threw:", e.message);
}
for (const n of M.anchorNames(r) || []) {
  console.log(" resolve", n, "=", JSON.stringify(M.resolveAnchor(r, n)));
}
