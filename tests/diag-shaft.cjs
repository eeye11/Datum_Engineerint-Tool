global.window = { crypto: { randomUUID: () => "diag" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");
require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/smart-dimension.js");
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/drawing-state.js");

const F = global.window.enggDrawingState.geometryFactories;
const M = global.window.enggMeasurement;
const S = global.window.enggSmartDimension;
const D = global.window.enggDimensionModel;

const shaft = F.shaft({ x: 0, y: 0 }, { x: 200, y: 0 });
console.log("shaft geometry:", JSON.stringify(shaft.geometry));

shaft.geometry.diameter = 24;

const st = { scale: { mmPerUnit: 1, unit: "mm" }, objects: [shaft] };
const descriptors = S.propose([shaft], st) || [];
console.log("descriptors:", JSON.stringify(descriptors, null, 1));

const dia = descriptors.find((d) => d.dimensionType === "diameter");

if (dia) {
  const dim = F.dimension({
    dimensionType: dia.dimensionType,
    refs: dia.refs,
    placement: { x: 0, y: -20 },
  });
  console.log("dimension refs:", JSON.stringify(dim.sourceRefs));
  console.log("measurementFor:", JSON.stringify(D.measurementFor(dim, st)));
  console.log(
    "formatMeasurement:",
    JSON.stringify(D.formatMeasurement(dim, st)),
  );
  console.log("measurePoints:", JSON.stringify(D.measurePoints(dim, st)));
  try {
    console.log(
      "graphicsFor:",
      JSON.stringify(D.graphicsFor(dim, st), null, 1),
    );
  } catch (e) {
    console.log("graphicsFor threw:", e.message);
  }
} else {
  console.log("NO diameter descriptor offered");
}

// Compare against a circle, which takes the anchor route.
const circle = F.circle({ x: 0, y: 0 }, 25);
const cst = { scale: { mmPerUnit: 1, unit: "mm" }, objects: [circle] };
const cd = (S.propose([circle], cst) || []).find(
  (d) => d.dimensionType === "diameter",
);
console.log("\ncircle diameter refs:", JSON.stringify(cd && cd.refs));
if (cd) {
  const cdim = F.dimension({
    dimensionType: "diameter",
    refs: cd.refs,
    placement: { x: 0, y: -20 },
  });
  console.log(
    "circle graphics:",
    JSON.stringify(D.graphicsFor(cdim, cst), null, 1),
  );
}
