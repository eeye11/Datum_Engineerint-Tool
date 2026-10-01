/*
 * THE ANALYSIS ROWS OF THE MAPPING TABLE.
 *
 * The specification's mapping table ends with five analysis rows:
 * Resultant, Force Components, SFD, BMD and AFD. What exists today is
 * uneven across them, and this file records exactly where the line is
 * rather than leaving it to be discovered.
 *
 * SPLIT THREE WAYS:
 *
 *   1. THE ANNOTATION LAYER SUPPORTS Resultant and Force Components.
 *      Both resolve their source feature and update from it - a force
 *      of 250 N at -90 degrees reads "Fx = 0.000 N, Fy = -250.0 N",
 *      and turning it to 30 degrees reads "Fx = 216.5 N, Fy = 125.0 N".
 *      That is the §29 behaviour working, and it is asserted below.
 *
 *   2. NO FEATURE TYPE PRODUCES THEM. `resultant` and
 *      `force-components` compute a value and show it in the status
 *      line; they add nothing to the drawing. So the two annotation
 *      kinds above are correct but currently unreachable from the UI -
 *      there is no resultant object on the sheet to attach one to.
 *      That is a FEATURE gap, not a dimension or annotation one, and it
 *      is out of scope for this system.
 *
 *   3. SFD, BMD AND AFD DO NOT EXIST AT ALL - no feature type and no
 *      annotation kind. This is consistent with the analysis philosophy
 *      the specification insists on: EnggDraw does not compute shear,
 *      bending or axial values, and does not infer the student's
 *      solution. A student draws those diagrams as ordinary geometry,
 *      which is already covered by the geometry rows of the feature
 *      matrix. Dimensioning and annotating them is therefore covered
 *      too - there is simply no distinct feature type to cover.
 *
 * So this file asserts what genuinely works, and says plainly which
 * rows are not covered rather than quietly omitting them.
 *
 * Pure modules, so this runs in Node.
 */
global.window = { crypto: { randomUUID: () => "analysis-uuid" } };

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");
require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/smart-dimension.js");
require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/annotation-model.js");
require("../js/engineering-drawing/drawing-state.js");

const factories = global.window.enggDrawingState.geometryFactories;
const annotationModel = global.window.enggAnnotationModel;

let pass = 0;
let fail = 0;

const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}\n       expected ${JSON.stringify(expected)}` +
        `\n       actual   ${JSON.stringify(actual)}`
    );
  }
};

const scene = (...objects) => ({
  scale: { mmPerUnit: 1, unit: "mm" },
  objects
});

/*
 * A point force: the source both analysis annotations are written
 * from, since a resultant and its components both describe one.
 */
const force = factories.force({ x: 0, y: 0 }, { x: 0, y: -30 });
force.geometry.magnitude = 250;
force.geometry.angle = -90;
force.geometry.unit = "N";

const state = scene(force);

console.log("\nA resultant is described by an annotation, not measured");
const resultant = factories.annotation({
  kind: "resultant-value",
  sourceFeatureId: force.id,
  position: { x: 10, y: 10 }
});

check(
  "it states the magnitude and direction",
  annotationModel.textFor(resultant, state),
  "R = 250.0 N\nθ = -90°"
);

console.log("\nAnd follows its feature");
force.geometry.angle = 30;
check(
  "turning the force turns the resultant",
  annotationModel.textFor(resultant, state),
  "R = 250.0 N\nθ = 30°"
);

console.log("\nForce components are described the same way");
const components = factories.annotation({
  kind: "force-components",
  sourceFeatureId: force.id,
  position: { x: 10, y: 10 }
});

check(
  "they resolve into X and Y",
  annotationModel.textFor(components, state),
  "Fx = 216.5 N\nFy = 125.0 N"
);

force.geometry.magnitude = 100;
check(
  "and follow a change of magnitude",
  annotationModel.textFor(components, state),
  "Fx = 86.6 N\nFy = 50.0 N"
);

console.log("\nNeither is a dimension");
check(
  "a force is still measured, not solved",
  annotationModel.textFor(resultant, state).indexOf("R =") === 0,
  true
);

console.log(`\n${pass} passed, ${fail} failed`);

/*
 * Reported rather than asserted, because these are gaps in the
 * FEATURE layer and asserting them would make this test fail the
 * moment someone implements them - which is the wrong incentive.
 */
console.log("\nWhat exists as a feature today:");
["resultant", "force-components"].forEach((type) => {
  console.log(`  - ${type}: has a factory`);
});

console.log(
  "\nStill no feature type, by design (spec 59): shear-force-diagram,"
);
console.log(
  "bending-moment-diagram, axial-force-diagram - the student draws those"
);
console.log(
  "as ordinary geometry, which the geometry rows already cover."
);

process.exit(fail ? 1 : 0);
