global.window = { crypto: { randomUUID: () => "analysis" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");
require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/smart-dimension.js");
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/annotation-model.js");
require("../js/engineering-drawing/drawing-state.js");

const F = global.window.enggDrawingState.geometryFactories;
const M = global.window.enggMeasurement;
const A = global.window.enggAnnotationModel;
const S = global.window.enggSmartDimension;
const st = { scale: { mmPerUnit: 1, unit: "mm" }, objects: [] };

console.log("annotation kinds:", Object.keys(A.KINDS).join(", "));

/*
 * The analysis rows of the mapping table.
 *
 * Each is asked two questions: does a feature of that kind exist to be
 * measured or labelled, and if a label names a feature, does it
 * actually resolve?
 */
const ANALYSIS = [
  ["resultant", "resultant-value"],
  ["force-components", "force-components"],
  ["shear-force-diagram", "shear-value"],
  ["bending-moment-diagram", "moment-diagram-value"],
  ["axial-force-diagram", "axial-value"],
];

ANALYSIS.forEach(([type, kind]) => {
  const feature = F[type] ? "factory exists" : "NO FACTORY";
  const kindExists = !!A.KINDS[kind];
  console.log(
    `${type}: feature=${feature} kind(${kind})=${kindExists ? "exists" : "MISSING"}`,
  );
});

/*
 * Does a resultant-value annotation resolve against a plain force?
 * The kind exists, so this is the question that decides whether the
 * row is usable or merely declared.
 */
const force = F.force({ x: 0, y: 0 }, { x: 0, y: -30 });
force.geometry.magnitude = 250;
force.geometry.angle = -90;
force.geometry.unit = "N";

const scene = { scale: { mmPerUnit: 1, unit: "mm" }, objects: [force] };

const label = F.annotation({
  kind: "resultant-value",
  sourceFeatureId: force.id,
  position: { x: 10, y: 10 },
});

console.log(
  "\nresultant-value text on a force:",
  JSON.stringify(A.textFor(label, scene)),
);
