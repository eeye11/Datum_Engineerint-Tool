/*
 * ============================================================
 * ENGINEERING QUANTITIES, AND HOW THEY ARE WRITTEN
 * ============================================================
 *
 * A drawing states quantities - 500 mm, 35°, Ø50, R25, F = 100 N, w = 5 N/m -
 * and every one of those is the product of a number, a convention prefix and
 * a unit. Getting them right is not a formatting detail: a dimension that can
 * read "500" without its unit is ambiguous with 500 newtons, which is a
 * different physical quantity that the same drawing may well also contain.
 *
 * ============================================================
 * THE THREE RULES THIS MODULE EXISTS TO ENFORCE
 * ============================================================
 *
 * 1. A VISIBLE QUANTITY ALWAYS CARRIES ITS UNIT. Never "500". Never "Ø50".
 *    Never "35". The unit is not decoration that a setting may remove; it is
 *    part of what the number means, and a drawing routinely carries a 250 mm
 *    dimension beside a 250 N force precisely because the reader has to be
 *    able to tell them apart at a glance.
 *
 * 2. NO APPROXIMATION MARK. The tilde never appears. Not in a preview, not
 *    after rounding, not on a dimension that was used to establish the
 *    document's scale. A tilde says "this drawing does not know what this
 *    number means" - and the calibration system exists precisely to remove
 *    that doubt, so marking its own result as uncertain would be arguing
 *    against the feature that produced it. An uncalibrated document has no
 *    honest length to state, and that is said in the calibration prompt where
 *    the student can act on it, rather than by littering the drawing with
 *    characters they cannot act on either.
 *
 * 3. THE NUMBER IS NEVER A STRING UNTIL IT IS TEXT. Everything here takes a
 *    number and a quantity type and produces the finished text in one place,
 *    so a dimension, a magnitude and a panel readout cannot drift into
 *    disagreeing about what a number means.
 *
 * ============================================================
 * WHY IT IS ITS OWN MODULE
 * ============================================================
 *
 * The unit used to be assembled independently in three places - the dimension
 * model, the annotation model, and the statics profile - each with its own
 * conditional on whether to print it. That is three chances to disagree about
 * "100 N" versus "100", and the disagreement is invisible in any single file.
 *
 * So this module is the only place a quantity becomes text, and the other
 * modules ask it. A new feature that wants to state a force gets the same
 * answer as every other feature that states a force, without knowing anything
 * about units.
 */
/*
 * THE LENGTH UNITS THE DOCUMENT UNDERSTANDS.
 *
 * Every one is defined against the millimetre, so converting between them is
 * exact and cannot accumulate the way repeated multiplication would.
 *
 * Read by the dimension module and the annotation module rather than
 * restated, so adding a unit here adds it everywhere at once.
 */
const LENGTH_UNITS = {
  mm: { label: "mm", mm: 1 },
  cm: { label: "cm", mm: 10 },
  m: { label: "m", mm: 1000 },
};

const DEFAULT_LENGTH_UNIT = "mm";

/*
 * THE TORQUE UNITS THE DOCUMENT UNDERSTANDS.
 *
 * Every one is defined against the newton-metre, so converting
 * between them is exact and cannot accumulate the way repeated
 * multiplication would.
 *
 * The conversions:
 *   1 kN·m  = 1000 N·m                       (exact, by definition)
 *   1 lbf·ft = 1.3558179483314004 N·m        (exact by the international
 *                                             pound and foot: 4.4482216152605 N
 *                                             × 0.3048 m)
 */
const TORQUE_UNITS = {
  "N·m": { label: "N·m", Nm: 1 },
  "kN·m": { label: "kN·m", Nm: 1000 },
  /*
   * WRITTEN AS THE PRODUCT, NOT AS ITS EXPANSION.
   *
   * The comment above states the derivation - one pound-force times one foot
   * - and the literal it used to hold was that product already multiplied
   * out. An IEEE double cannot hold the product exactly, so the expanded
   * decimal was a slightly different number from the one the comment
   * describes, and ESLint's `no-loss-of-precision` flagged it for exactly
   * that reason.
   *
   * Multiplying here is not a rounding difference: it is the SAME double the
   * product produces, and it keeps the code and its explanation saying the
   * same thing. `4.4482216152605` is the exact conversion of one pound-force
   * to newtons, which is where the value comes from.
   */
  "lbf·ft": { label: "lbf·ft", Nm: 4.4482216152605 * 0.3048 }
};

const DEFAULT_TORQUE_UNIT = "N·m";

/*
 * THE QUANTITY TYPES, and the unit each one carries.
 *
 * A type rather than a unit per call site, because the unit follows from what
 * is being measured rather than from where it is being written: a moment is
 * force x length in whatever force and length units the document is using,
 * and a reader who wrote "25 N·m" beside a beam dimensioned in millimetres
 * means exactly that.
 *
 * `per` marks the types that are a rate - newtons per metre for a load
 * intensity - which is the only structural difference between them, and
 * writing it as data avoids a chain of conditionals that would need a new
 * branch every time a quantity type was added.
 */
const QUANTITIES = {
  length: { unit: () => null, suffix: "" },
  angle: { unit: () => "°", suffix: "°" },

  force: { unit: () => "N", suffix: "N" },
  moment: { unit: () => "N·m", suffix: "N·m" },
  distributedLoad: { unit: () => "N/m", suffix: "N/m" },
  area: { unit: () => "mm²", suffix: "mm²" },
};

function finite(value) {
  /* `Number(null)` is 0, which is a finite number — but null is an absent
   * value, not a zero, and must not be silently converted. */
  if (value === null) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

/*
 * A number as engineering text.
 *
 * Trailing zeros are dropped, because "100 mm" is how a dimension is
 * written and "100.00 mm" is not. This is the GENERAL form; a dimension
 * passes its own precision to `formatMeasurement` instead, because
 * dimensions are read together and must agree in how many digits they show.
 */
function number(value) {
  const numeric = finite(value);

  if (numeric === null) {
    return "";
  }

  /*
   * A value that is not a round number is shown to two decimals, which is
   * the precision a drawing is read at. A whole number keeps its shape:
   * the millimetres are counted, not measured off the screen.
   */
  const rounded =
    Math.abs(numeric - Math.round(numeric)) < 1e-9
      ? Math.round(numeric)
      : Math.round(numeric * 100) / 100;

  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/*
 * A number at a stated precision, which is what a dimension uses.
 *
 * Dimensions are read side by side, so "100 mm" next to "100.25 mm" implies
 * the first is the coarser measurement - which is a claim about the drawing
 * rather than about the value. One consistent precision across the sheet is
 * what makes two dimensions comparable at a glance, so the trailing zeros
 * are kept here even though `number` drops them.
 */
function atPrecision(value, precision) {
  const numeric = finite(value);

  if (numeric === null) {
    return "";
  }

  const places =
    precision === null || precision === undefined
      ? 2
      : Math.min(6, Math.max(0, Math.trunc(Number(precision) || 0)));

  return numeric.toFixed(places);
}

/*
 * ============================================================
 * A DIMENSION
 * ============================================================
 *
 * `prefix` is the engineering convention that distinguishes one dimension
 * from another of the same length - R for a radius, Ø for a diameter, ⌀ for
 * its own sake on a linear one - and it is part of the measurement, not a
 * decoration applied afterwards. A dimension with no prefix and no unit is
 * not a dimension, so the unit is always written.
 */
function formatLength(value, unit, options = {}) {
  const { prefix = "", precision = null, angular = false } = options;

  const text = atPrecision(value, precision);

  if (angular) {
    /*
     * AN ANGLE IS NOT A LENGTH. It carries the degree sign and nothing
     * else - no millimetres, because there are none.
     */
    return `${prefix}${text}°`;
  }

  const chosen = LENGTH_UNITS[unit] ? unit : DEFAULT_LENGTH_UNIT;

  return `${prefix}${text} ${chosen}`;
}

function formatAngle(value, precision = null) {
  return `${atPrecision(value, precision)}°`;
}

/*
 * ============================================================
 * A MAGNITUDE
 * ============================================================
 *
 * The unit follows from the quantity type, so a caller states WHAT it is
 * measuring rather than what the unit should be. That is what stops a force
 * being labelled in millimetres: there is no path by which a force reaches
 * this function without saying it is a force.
 */
function formatMagnitude(value, quantityType) {
  const quantity = QUANTITIES[quantityType];

  if (!quantity) {
    return number(value);
  }

  return `${number(value)} ${quantity.unit()}`;
}

/*
 * A magnitude with the symbol that names it: "F = 100 N", "w = 5 N/m".
 *
 * The symbol is passed in rather than derived, because which letter is
 * correct depends on what the feature is and the feature knows that; what
 * this module owns is that the number and its unit are always right.
 */
function formatLabeled(symbol, value, quantityType) {
  const formatted = formatMagnitude(value, quantityType);

  return symbol ? `${symbol} = ${formatted}` : formatted;
}

/*
 * ============================================================
 * IS A NUMBER MEANINGFUL YET?
 * ============================================================
 *
 * A measurement that cannot be taken is not a measurement of zero. Zero is a
 * real engineering value - a genuinely zero-length member, a force of zero -
 * and printing it for a reference that could not be resolved would put a
 * real answer on the drawing where there is none.
 */
function isMeasurable(value) {
  return finite(value) !== null;
}

/*
 * ============================================================
 * THE ONE UNIT TABLE, AND CONVERSION
 * ============================================================

/*
 * ============================================================
 * THE ONE UNIT TABLE, AND CONVERSION
 * ============================================================
 *
 * Every quantity's units, each defined against ONE base unit so converting
 * between any two of them is a single division and cannot accumulate the way
 * repeated multiplication would.
 *
 * WHY THIS EXISTS RATHER THAN A LIST PER FEATURE.
 *
 * There were already TWO moment unit lists in the application - `["N·m",
 * "kN·m"]` on the load profile and `["N·m", "kN·m", "N·mm", "lb·ft"]` beside
 * the moment's value popup - so the units a moment could be stated in depended
 * on which part of the code was asking. A force's list and a load's were a
 * third and a fourth. Here there is ONE list per quantity, and a feature asks
 * for the quantity it is stating.
 *
 * `base` names the unit every factor is relative to, so a conversion between
 * two units is `value * from.factor / to.factor` and never a chain.
 *
 * `customary` marks the units that are not decimal multiples of the base -
 * pounds-force, inches, feet, psi. They are in the same table and convert the
 * same way; the flag only records that their factors are exact irrational
 * relationships rather than powers of ten, which is worth knowing when reading
 * a conversion back.
 */
const QUANTITY_UNITS = {
  length: {
    base: "mm",
    units: {
      mm: { label: "mm", factor: 1 },
      cm: { label: "cm", factor: 10 },
      m: { label: "m", factor: 1000 },
      in: { label: "in", factor: 25.4, customary: true },
      ft: { label: "ft", factor: 304.8, customary: true }
    }
  },

  force: {
    base: "N",
    units: {
      N: { label: "N", factor: 1 },
      kN: { label: "kN", factor: 1000 },
      "lbf": { label: "lbf", factor: 4.4482216152605, customary: true }
    }
  },

  moment: {
    base: "N·m",
    units: {
      "N·m": { label: "N·m", factor: 1 },
      "kN·m": { label: "kN·m", factor: 1000 },
      "N·mm": { label: "N·mm", factor: 0.001 },
      "lbf·ft": {
        label: "lbf·ft",
        factor: 4.4482216152605 * 0.3048,
        customary: true
      }
    }
  },

  distributedLoad: {
    base: "N/m",
    units: {
      "N/m": { label: "N/m", factor: 1 },
      "kN/m": { label: "kN/m", factor: 1000 },
      "N/mm": { label: "N/mm", factor: 1000 },
      "lbf/ft": {
        label: "lbf/ft",
        factor: 4.4482216152605 / 0.3048,
        customary: true
      }
    }
  },

  area: {
    base: "mm²",
    units: {
      "mm²": { label: "mm²", factor: 1 },
      "cm²": { label: "cm²", factor: 100 },
      "m²": { label: "m²", factor: 1e6 },
      "in²": { label: "in²", factor: 645.16, customary: true }
    }
  },

  pressure: {
    base: "Pa",
    units: {
      Pa: { label: "Pa", factor: 1 },
      kPa: { label: "kPa", factor: 1000 },
      MPa: { label: "MPa", factor: 1e6 },
      psi: { label: "psi", factor: 6894.757293168, customary: true }
    }
  },

  /*
   * AN ANGLE IS NOT A LENGTH AND HAS NO CONVERSION.
   *
   * Degrees and radians name the same angle at different scale, but a drawing
   * states an angle in degrees and nothing in the model is stored in radians,
   * so offering a choice would add a conversion nobody asked for. It is listed
   * with its one unit so a caller asking "what units does an angle have" gets
   * an answer rather than null.
   */
  angle: {
    base: "°",
    units: {
      "°": { label: "°", factor: 1 }
    }
  }
};

/*
 * The units a quantity may be stated in, in the order they should be offered.
 *
 * Insertion order, so the base unit comes first and a panel's default is the
 * one the drawing is already using. Returns an empty list for a quantity this
 * module has no entry for, so a caller cannot be handed another quantity's
 * units by accident.
 */
function unitsFor(quantityType) {
  const quantity = QUANTITY_UNITS[quantityType];

  return quantity ? Object.keys(quantity.units) : [];
}

function isUnitFor(quantityType, unit) {
  return Boolean(QUANTITY_UNITS[quantityType]?.units?.[unit]);
}

/*
 * HOW MANY BASE UNITS ONE OF `unit` IS WORTH.
 *
 * Null for a unit the quantity does not have, so a conversion is refused
 * rather than defaulted to 1 - a silent factor of one is how "250 N" becomes
 * "250 kN".
 */
function conversionFactor(quantityType, unit) {
  return QUANTITY_UNITS[quantityType]?.units?.[unit]?.factor ?? null;
}

/*
 * A VALUE CONVERTED FROM ONE UNIT TO ANOTHER.
 *
 *     convertValue(250, "force", "N", "kN")  ->  0.25
 *     convertValue(1000, "length", "mm", "m") ->  1
 *
 * A CONVERSION, NOT A RELABEL. The physical quantity is what does not move:
 * 250 N and 0.25 kN are the same push, and this is the one function that says
 * so. It returns the value UNCHANGED when either unit is unknown, because the
 * caller has asked a question this module cannot answer and inventing a factor
 * would corrupt the number rather than report the problem.
 */
function convertValue(value, quantityType, fromUnit, toUnit) {
  const numeric = finite(value);

  if (numeric === null) {
    return value;
  }

  if (fromUnit === toUnit) {
    return numeric;
  }

  const from = conversionFactor(quantityType, fromUnit);
  const to = conversionFactor(quantityType, toUnit);

  if (from === null || to === null) {
    return numeric;
  }

  return (numeric * from) / to;
}

const enggQuantities = {
  LENGTH_UNITS,
  DEFAULT_LENGTH_UNIT,
  TORQUE_UNITS,
  DEFAULT_TORQUE_UNIT,

  number,
  atPrecision,
  formatLength,
  formatAngle,
  formatMagnitude,
  formatLabeled,
  isMeasurable,

  QUANTITY_UNITS,
  unitsFor,
  conversionFactor,
  convertValue,
  isUnitFor,
};

export default enggQuantities;
