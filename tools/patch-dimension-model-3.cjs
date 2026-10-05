/*
 * Two corrections to dimension-model.js.
 *
 *  1. round() was made to return a STRING so that trailing zeros
 *     survive, which fixed the display but broke its contract: it is a
 *    numeric rounding helper and every caller that uses it as a number
 *    - the angle check, the tests - now gets text.
 *
 *     The two jobs are separate. round() rounds a number, precisely,
 *     and says nothing about display. formatMeasurement() is where a
 *    number becomes text, and THAT is where the precision is fixed to
 *    the stated number of places. Doing both in one function is what
 *     made it impossible to be right at both.
 *
 *  2. An angle lost its `angular` flag on the way out, so it was
 *     formatted as though it were a length in an arbitrary unit:
 *     "90.00" instead of "90°". The flag is set inside a branch that
 *    the angle path never reached, because the angle returns its own
 *    object rather than passing through the shared tail.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(before, after);
  changed += 1;
}

/* ---- 1. round() rounds; formatting fixes the precision ---- */

swap(
  `    const text = Object.is(rounded, -0)
      ? (0).toFixed(places)
      : Number(rounded).toFixed(places);

    return places === 0
      ? String(Number(text))
      : text;`,
  `    return Object.is(rounded, -0) ? 0 : rounded;`,
  "round return",
);

/* The precision is applied where the number becomes text. */

swap(
  `    const precision = resolvePrecision(dimension, state);

    const value = round(
      measurement.value,
      precision
    );`,
  `    const precision = resolvePrecision(dimension, state);

    const rounded = round(
      measurement.value,
      precision
    );

    /*
     * Fixed to the stated precision HERE, where the number becomes
     * text, rather than by the rounding helper - which is a numeric
     * function and drops trailing zeros as a matter of course.
     *
     * Dimensions are read together, and "100 mm" beside "100.25 mm"
     * implies the first is the less precise measurement of the two.
     * Engineering dimensions are shown at one consistent precision
     * precisely so they can be compared at a glance.
     */
    const value = formatAtPrecision(
      rounded,
      precision
    );`,
  "formatMeasurement precision",
);

/* ---- the helper ---- */

swap(
  `  function round(value, precision) {`,
  `  function formatAtPrecision(value, precision) {
    const places = Math.max(
      0,
      Math.min(6, Math.round(Number(precision) || 0))
    );

    const text = Number(value).toFixed(places);

    /*
     * Zero decimal places is a whole number and should read as one -
     * "125 mm", not "125 mm" with a stray point.
     */
    return places === 0 ? String(Number(text)) : text;
  }

  function round(value, precision) {`,
  "formatAtPrecision helper",
);

/* ---- 2. an angle keeps its flag ---- */

swap(
  `    const degrees =
      Math.abs(
        (Math.atan2(determinant, dot) * 180) /
          Math.PI
      ) *
      (referenceIsReversed(firstSpan, secondSpan)
        ? -1
        : 1);

    return {
      value: Math.abs(degrees),
      unit: "deg",
      degrees: true,
      calibrated: Boolean(
        scale && scale.readScale?.(state)
      ),
    };`,
  `    /*
     * atan2 of the determinant and the dot product gives the angle
     * with its sign, and is correct for obtuse angles where an acos
     * of the dot alone would need its sign restored. The absolute
     * value is taken here because an engineering angle dimension
     * states the angle between two lines, which is the smaller one -
     * the reflex angle is not what the reader is checking.
     */
    const degrees =
      (Math.atan2(determinant, dot) * 180) / Math.PI;

    return {
      value: Math.abs(degrees),

      /*
       * Angles are dimensionless. The flag is what stops a unit being
       * appended, and it is what makes the degree sign appear instead
       * - "90°" rather than "90.00" or "90 deg".
       */
      unit: "deg",
      angular: true,
      degrees: true,
      calibrated: true,
    };`,
  "angle result",
);

/* referenceIsReversed no longer decides the sign. */

swap(
  `  function referenceIsReversed() {
    return true;
  }`,
  ``,
  "referenceIsReversed",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 5 corrections`);
