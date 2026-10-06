/*
 * One-off diagnostic: trace the Length pipeline end-to-end for the
 * concrete case the specification names.
 *
 *   Create a Beam, enter 500 mm, on a sheet already calibrated at
 *   250 mm per model unit.
 *
 * It prints, at each stage, the number that actually flows - so the
 * first point where preview and commit disagree (or where a value is
 * converted twice) is visible rather than inferred.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { locate } = require("../../tests/helpers/source-path.cjs");

const dimensionsSrc = readFileSync(locate("dimensions.js"), "utf8");

const sandbox = {};
const window = sandbox;
window.window = window;

// Load the scale module the way the browser does.
// eslint-disable-next-line no-new-func
new Function("window", dimensionsSrc)(window);

const dimensions = window.enggDimensions;

const state = { scale: { mmPerUnit: 250, unit: "mm" } };

const log = (label, value) => console.log(`${label.padEnd(46)} ${value}`);

log("typed input", "500 mm");
log("parsed canonical (mm)", 500);
log("sheet mmPerUnit", dimensions.readScale(state).mmPerUnit);

const modelLength = dimensions.fromEngineering(state, 500, "mm");
log("engineeringToModel(500 mm)", modelLength);

log(
  "model -> engineering(modelLength)",
  dimensions.toEngineering(state, modelLength).value,
);

console.log("\n-- preview path (showSizingPreview) --");

/*
 * showSizingPreview on a calibrated sheet computes:
 *     world = fromEngineering(state, value, unit)      // mm -> world
 * then calls updateFeatureProperty(preview, "length", world)
 * whose length branch converts AGAIN: fromEngineering(state, world, "mm").
 */
const previewWorld = dimensions.fromEngineering(state, 500, "mm");
log("preview computes world once", previewWorld);
const previewStored = dimensions.fromEngineering(state, previewWorld, "mm");
log("setter converts the SAME value again", previewStored);
log(
  "preview geometry measured back (mm)",
  dimensions.toEngineering(state, previewStored).value,
);

console.log("\n-- commit path (applyValue -> setter) --");
const commitStored = dimensions.fromEngineering(state, 500, "mm");
log(
  "commit geometry measured back (mm)",
  dimensions.toEngineering(state, commitStored).value,
);

console.log(
  "\npreview === commit ?",
  Math.abs(previewStored - commitStored) < 1e-9,
);
