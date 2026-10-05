/*
 * radialGraphics returned null for every diameter and radius.
 *
 * graphicsFor dispatches radial dimensions by looking for a PROPERTY
 * reference on the dimension, and only a dimension created from a
 * {kind:"property"} reference has one. A diameter against a Circle is
 * almost always made from the circle's own anchor - "east" - because
 * that is what the measurement capability offers, so the property
 * reference is absent and the radial branch was never taken.
 *
 * The dispatch should be on the MEASUREMENT TYPE, which is what the
 * graphics actually differ by. A property reference is one way to
 * state a diameter; an anchor reference is the other, and both must
 * draw the same shape.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

const before = `    if (
      dimension.dimensionType === "radius" ||
      dimension.dimensionType === "diameter"
    ) {
      return radialGraphics(`;

const after = `    /*
     * Dispatched on the MEASUREMENT TYPE, not on how the dimension
     * refers to its feature.
     *
     * A diameter is radial whichever way it is referenced: the shaft
     * case carries a property reference to its own diameter field,
     * while a circle is referred to by one of its anchors. Looking for
     * a property reference only - which is what this did - meant a
     * diameter against a circle silently skipped the radial branch
     * and drew nothing at all.
     */
    if (
      dimension.dimensionType === "radius" ||
      dimension.dimensionType === "diameter"
    ) {
      /*
       * The feature is found from whichever reference exists, so a
       * radial dimension draws from the circle or the shaft it
       * actually measures.
       */
      const radialReference =
        propertyRef ||
        (dimension.sourceRefs || [])[0];

      return radialGraphics(`;

if (!source.includes(before)) {
  console.log("radial dispatch not found");
  process.exit(1);
}

source = source.replace(before, after);

/* Pass the resolved reference rather than the one derived from the property ref. */

const callBefore = `        dimension,
        state,
        object,
        measurement,
        text
      );
    }`;

const callAfter = `        dimension,
        state,
        object,
        measurement,
        text,
        radialReference
      );
    }`;

if (source.includes(callBefore)) {
  source = source.replace(callBefore, callAfter);
} else {
  console.log("radial call site not found");
}

const signatureBefore = `  function radialGraphics(
    dimension,
    state,
    object,
    measurement,
    text
  ) {`;

const signatureAfter = `  function radialGraphics(
    dimension,
    state,
    object,
    measurement,
    text,
    reference
  ) {`;

if (source.includes(signatureBefore)) {
  source = source.replace(signatureBefore, signatureAfter);
} else {
  console.log("radialGraphics signature not found");
}

/* The object is looked up from the reference actually in use. */

const bodyBefore = `    if (!object) {
      return null;
    }

    const centre =
      root.enggMeasurement.resolveAnchor(
        object,
        "center"
      ) ||
      root.enggMeasurement.resolveAnchor(
        object,
        "position"
      );`;

const bodyAfter = `    /*
     * The feature is resolved from the reference actually in use. A
     * Circle names its centre "center"; a support, a particle or a
     * rigid body name theirs "position", and both are legitimate
     * sources for a radial dimension - so both are tried rather than
     * only the one that happens to suit a circle.
     */
    const measured =
      object ||
      model_findObject(state, reference?.featureId);

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
      );`;

if (source.includes(bodyBefore)) {
  source = source.replace(bodyBefore, bodyAfter);
} else {
  console.log("radialGraphics body not found");
}

/* featureRadius is called on the resolved feature. */

source = source.replace(
  "    const radius = featureRadius(object);",
  "    const radius = featureRadius(measured);",
);

/* findObject is exposed on the module, so reference it directly. */

source = source.replace(/model_findObject/g, "findObject");

fs.writeFileSync(path, source);
console.log("radial dispatch patched");
