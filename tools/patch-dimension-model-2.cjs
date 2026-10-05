/*
 * Two remaining corrections to dimension-model.js.
 *
 *  1. round() still returned a bare number, so JavaScript dropped the
 *     trailing zeros: a document at two decimal places showed
 *     "100 mm" beside "100.25 mm". Dimensions are read together, and
 *     that reads as though the first were the less precise
 *     measurement. It now returns the number fixed to its precision.
 *
 *  2. resolvePrecision treated a document precision of 0 as absent,
 *     because Number.isFinite(0) is true but the code only guarded
 *     against NaN by falling through on a falsy value. A document
 *     deliberately set to whole millimetres must show "125 mm", not
 *     "125.00 mm", so 0 has to be honoured rather than treated as
 *     "not configured".
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

/* ---- 1. fixed to the stated precision ---- */

swap(
  `    return Object.is(rounded, -0) ? 0 : rounded;`,
  `    /*
     * Fixed to the stated precision rather than left to
     * JavaScript's number-to-string, which drops trailing zeros.
     *
     * This is not cosmetic. Two dimensions on one drawing are read
     * together, and "100 mm" beside "100.25 mm" implies the first is
     * a rounder, less precise measurement than it is. Engineering
     * dimensions are shown at a consistent precision precisely so
     * they can be compared at a glance.
     */
    const text = Object.is(rounded, -0)
      ? (0).toFixed(places)
      : Number(rounded).toFixed(places);

    return places === 0
      ? String(Number(text))
      : text;`,
  "round return",
);

/* ---- 2. a precision of zero is a choice, not an absence ---- */

swap(
  `    const fromStyle = dimension?.style?.precision;

    if (Number.isFinite(Number(fromStyle))) {
      return Number(fromStyle);
    }

    const fromDocument =
      state?.dimensionPrecision ??
      state?.styleDefaults?.dimensionPrecision;

    return Number.isFinite(Number(fromDocument))
      ? Number(fromDocument)
      : DEFAULT_PRECISION;`,
  `    /*
     * Zero is a legitimate precision - a drawing dimensioned in whole
     * millimetres should read "125 mm", not "125.00 mm" - so the test
     * is whether a value was supplied, not whether it is truthy.
     * Only a genuinely absent precision falls back to the default.
     */
    const fromStyle = dimension?.style?.precision;

    if (fromStyle !== null && fromStyle !== undefined) {
      const number = Number(fromStyle);

      if (Number.isFinite(number)) {
        return number;
      }
    }

    const fromDocument =
      state?.dimensionPrecision ??
      state?.styleDefaults?.dimensionPrecision;

    if (
      fromDocument !== null &&
      fromDocument !== undefined
    ) {
      const number = Number(fromDocument);

      if (Number.isFinite(number)) {
        return number;
      }
    }

    return DEFAULT_PRECISION;`,
  "resolvePrecision",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 2 corrections`);
