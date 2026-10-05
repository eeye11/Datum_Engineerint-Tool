/*
 * Two defects in dimension-model.js, found by its tests.
 *
 *  1. The document's precision was never applied. resolvePrecision
 *     read state.dimensionPrecision and DEFAULT_PRECISION, but
 *     nothing ever put a document precision there, so every dimension
 *     fell back to 2 - and then the value was formatted without
 *     trailing zeros at all, so "100.00 mm" printed as "100 mm".
 *
 *     The rounding is what was wrong, not the number. 100 really is
 *     100.00 at two decimal places, and a dimension that shows "100 mm"
 *     next to one showing "100.25 mm" reads as though the first were
 *     less precise than it is. Engineering dimensions are shown at a
 *     consistent precision so they can be compared at a glance.
 *
 *  2. An angle measured nothing. spanOf returned the dimension's own
 *     MEASURED POINTS, not the features' spans - so it handed a
 *     single point to spanDirection, which needs a start and an end,
 *     and every angle returned null.
 *
 *     The included angle of two spans is a real measurement and is
 *     worth having, so this fixes the resolution rather than removing
 *     the type. The vertex is the end of the first span, which is the
 *     point the student selected first and therefore the one they mean.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

/* ---- 1. trailing zeros to the stated precision ---- */

const roundBefore = `function round(value, precision) {
  const factor = 10 ** precision;
  /*
   * Rounding through a factor and dividing back can produce
   * 3.9999999999 or 4.0000000001 in binary floating point, and a
   * dimension that reads "4.0000000001 mm" is a defect the user sees
   * every time. The epsilon nudges values that are a rounding
   * artefact away from a boundary back onto it, so the number shown
   * is the number meant.
   */
  const rounded =
    Math.round(value * factor * (1 + Number.EPSILON)) /
    factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}`;

const roundAfter = `function round(value, precision) {
  const places = Math.max(
    0,
    Math.min(6, Math.round(Number(precision) || 0))
  );

  const factor = 10 ** places;

  /*
   * Rounding through a factor and dividing back can produce
   * 3.9999999999 or 4.0000000001 in binary floating point, and a
   * dimension that reads "4.0000000001 mm" is a defect the user sees
   * every time. The epsilon nudges values that are a rounding
   * artefact away from a boundary back onto it, so the number shown
   * is the number meant.
   */
  const rounded =
    Math.round(value * factor * (1 + Number.EPSILON)) / factor;

  /*
   * Fixed to the stated precision rather than left to JavaScript's
   * number-to-string, which drops trailing zeros.
   *
   * This is not cosmetic. Two dimensions on one drawing are read
   * together, and "100 mm" beside "100.25 mm" implies the first is a
   * rounder, less precise measurement than it is. Engineering
   * dimensions are shown at a consistent precision precisely so they
   * can be compared at a glance, and a document-wide precision that
   * only sometimes shows itself is worse than none.
   */
  return Object.is(rounded, -0)
    ? (0).toFixed(places)
    : Number(rounded).toFixed(places);
}`;

if (source.includes(roundBefore)) {
  source = source.replace(roundBefore, roundAfter);
  changed += 1;
} else {
  console.log("round pattern not found");
}

/* ---- 2. angles resolve from the features' own spans ---- */

const angleBefore = `    const [first, second] = points;
    const firstSpan = spanOf(state, points, 0);
    const secondSpan = spanOf(state, points, 1);
    const a = spanDirection(firstSpan);
    const b = spanDirection(secondSpan);`;

const angleAfter = `    const [first, second] = points;

    /*
     * The SPANS, not the measured points.
     *
     * An included angle needs a direction on each side, and a
     * direction comes from a span's two ends. Handing spanDirection a
     * single measured point gave it nothing to work with, and every
     * angle silently became null - which reads to the user as "angles
     * do not work here" rather than as a defect.
     *
     * The two references have to be to DIFFERENT features for there to
     * be two spans. A dimension between two points of one span is a
     * distance across that span, and there is no angle in it.
     */
    const [firstRef, secondRef] =
      dimension.sourceRefs || [];

    const firstSpan =
      firstRef &&
      firstRef.featureId !== secondRef?.featureId
        ? spanOf(state, firstRef.featureId)
        : null;

    const secondSpan =
      secondRef &&
      secondRef.featureId !== firstRef?.featureId
        ? spanOf(state, secondRef.featureId)
        : null;

    const a = spanDirection(firstSpan);
    const b = spanDirection(secondSpan);`;

if (source.includes(angleBefore)) {
  source = source.replace(angleBefore, angleAfter);
  changed += 1;
} else {
  console.log("measureAngle pattern not found");
}

/* spanOf now takes a feature id and returns the feature's own span. */

const spanOfBefore = `function spanOf(state, points, index) {
  /*
   * A dimension between two anchors of ONE feature is a measurement
   * across that feature, so the span is the feature's own. Between
   * two features it is two spans, which is where an included angle
   * is meaningful.
   */
  return points[index] ? points[index] : null;
}`;

const spanOfAfter = `function spanOf(state, featureId) {
  const object = findObject(state, featureId);

  return object
    ? root.enggMeasurement.twoPointSpan(object)
    : null;
}`;

if (source.includes(spanOfBefore)) {
  source = source.replace(spanOfBefore, spanOfAfter);
  changed += 1;
} else {
  console.log("spanOf pattern not found");
}

/* measureAngle needs the dimension itself to read its references. */

const callBefore = `    if (type === "angular") {
      return measureAngle(points, state, scale);
    }`;

const callAfter = `    if (type === "angular") {
      return measureAngle(
        dimension,
        points,
        state,
        scale
      );
    }`;

if (source.includes(callBefore)) {
  source = source.replace(callBefore, callAfter);
  changed += 1;
} else {
  console.log("measureAngle call site not found");
}

const signatureBefore = `function measureAngle(
  points,
  state,
  scale
) {`;

const signatureAfter = `function measureAngle(
  dimension,
  points,
  state,
  scale
) {`;

if (source.includes(signatureBefore)) {
  source = source.replace(signatureBefore, signatureAfter);
  changed += 1;
}

/* ---- 3. remove the dead unit lookup in toEngineering ---- */

const deadBefore = `    const type = scale?.UNITS
      ? scale.UNITS[
          root.enggMeasurement.readScale
            ? root.enggDimensions.readScale(state).unit
            : "mm"
        ]
      : null;
    if (scale?.toEngineering) {`;

const deadAfter = `    /*
     * The conversion is the scale module's, called once, at the end.
     * Nothing here decides what a unit means - an unrecognised unit is
     * the scale module's problem, not this one's, and duplicating its
     * lookup here is how two implementations of "what unit is this"
     * end up disagreeing.
     */
    if (scale?.toEngineering) {`;

if (source.includes(deadBefore)) {
  source = source.replace(deadBefore, deadAfter);
  changed += 1;
} else {
  console.log("toEngineering dead code not found");
}

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 6 corrections`);
