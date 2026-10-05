/*
 * Undoes a blind replace that was applied to measureRadius as well as
 * to radialGraphics, then patches the radial dispatch properly.
 *
 * The earlier patch replaced every occurrence of
 * "const radius = featureRadius(object);" so that it read from the
 * feature radialGraphics had resolved. That string appears in TWO
 * functions: the one it was meant for, and measureRadius - where
 * `object` is already the right thing and `measured` does not exist.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

/* ---- 1. measureRadius goes back to its own local name ---- */

const measureRadiusStart = source.indexOf("function measureRadius(");

if (measureRadiusStart === -1) {
  console.log("measureRadius not found");
  process.exit(1);
}

const measureRadiusEnd = source.indexOf("\n  function ", measureRadiusStart);

const measureRadiusBody = source
  .slice(measureRadiusStart, measureRadiusEnd)
  .replace(
    /const radius = featureRadius\(measured\);/,
    "const radius = featureRadius(object);",
  );

source =
  source.slice(0, measureRadiusStart) +
  measureRadiusBody +
  source.slice(measureRadiusEnd);

/* ---- 2. radialGraphics resolves its own feature ---- */

const radialStart = source.indexOf("function radialGraphics(");

if (radialStart === -1) {
  console.log("radialGraphics not found");
  process.exit(1);
}

const radialHead = source.indexOf("if (!object) {", radialStart);

const centreEnd = source.indexOf("if (!centre) {", radialStart);

if (radialHead === -1 || centreEnd === -1) {
  console.log("radialGraphics body not found");
  process.exit(1);
}

const replacement = `/*
     * The feature is resolved from the reference actually in use.
     *
     * A Circle names its centre "center"; a support, a particle or a
     * rigid body name theirs "position". Both are legitimate sources
     * for a radial dimension, so both are tried - and the feature is
     * looked up here rather than relying on the caller having found
     * it, because a radius drawn from a property reference and a
     * radius drawn from an anchor reference reach here by different
     * routes.
     */
    const measured =
      object ||
      findObject(state, reference?.featureId);

    if (!measured) {
      return null;
    }

    const centre =
      root.enggMeasurement.resolveAnchor(
        measured,
        "center"
      ) ||
      root.enggMeasurement.resolveAnchor(
        measured,
        "position"
      );

    `;

source = source.slice(0, radialHead) + replacement + source.slice(centreEnd);

/* ---- 3. radialGraphics takes the reference ---- */

const signatureBefore = `  function radialGraphics(
    dimension,
    state,
    object,
    measurement,
    text
  ) {`;

if (source.includes(signatureBefore)) {
  source = source.replace(
    signatureBefore,
    `  function radialGraphics(
    dimension,
    state,
    object,
    measurement,
    text,
    reference
  ) {`,
  );
} else {
  console.log("radialGraphics signature not found");
}

fs.writeFileSync(path, source);
console.log("measureRadius restored; radialGraphics resolves its own feature");
