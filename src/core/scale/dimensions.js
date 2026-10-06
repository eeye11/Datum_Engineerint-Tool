/*
 * Dimensions and the document's physical scale.
 *
 * A drawing has two coordinate systems in it at once, and they are
 * not the same thing:
 *
 *   - DRAWING UNITS, which is what the geometry is stored in. Every
 *     feature keeps its position in these and never changes.
 *   - ENGINEERING UNITS, millimetres, which is what a person reads
 *     a dimension in.
 *
 * The scale is the relationship between them, and it belongs to the
 * DOCUMENT rather than to any feature. A beam does not measure
 * 250 mm; the drawing does, and the beam's stored length is that
 * measurement divided by the scale. This is why nothing here ever
 * rewrites stored geometry: a feature's numbers in drawing units
 * stay exactly as they were placed, and only the numbers shown to
 * the user are converted.
 *
 * That separation is the whole point. Rescaling the geometry to
 * "make it real" would move every feature, break every
 * parent/child offset, and change every force's application point
 * relative to the body it acts on - a set of edits that would all
 * have to be applied consistently or the drawing would be subtly
 * wrong. Keeping the relationship instead of the rewrite means
 * there is exactly one number to change, and changing it cannot
 * distort anything.
 */
/*
 * How many engineering units one drawing unit represents when the
 * drawing has never been calibrated.
 *
 * One drawing unit is one millimetre, which is the assumption the
 * rest of the application already makes: the status bar reports
 * millimetres and the thickness options are millimetres, so this
 * is not a new convention but the existing one written down.
 */
const DEFAULT_MM_PER_UNIT = 1;

/*
 * The units a dimension can be read in.
 *
 * All of them are defined against the millimetre, so converting
 * between them is exact and does not accumulate error the way
 * repeated scale multiplication would. Imperial units are defined
 * the same way - an inch IS 25.4 mm, so it needs no separate
 * arithmetic path and a sheet calibrated in inches converts to
 * millimetres by the same single multiplication as every other unit.
 */
const UNITS = {
  mm: { label: "mm", mm: 1 },
  cm: { label: "cm", mm: 10 },
  m: { label: "m", mm: 1000 },
  in: { label: "in", mm: 25.4 },
  ft: { label: "ft", mm: 304.8 }
};

const DEFAULT_UNIT = "mm";

/*
 * The document's scale.
 *
 * Null means the drawing is UNCALIBRATED: distances cannot be
 * stated in real units, because nothing ties drawing units to
 * millimetres. That is a different state from "calibrated at
 * 1:1", and the dimension tool has to be able to tell them apart -
 * one can be dimensioned straight away, the other has to ask
 * first.
 */
function readScale(state) {
  const scale = state?.scale;

  if (
      !scale ||
      !Number.isFinite(Number(scale.mmPerUnit)) ||
      Number(scale.mmPerUnit) <= 0
  ) {
    return null;
  }

  return {
    mmPerUnit: Number(scale.mmPerUnit),
    unit: UNITS[scale.unit] ? scale.unit : DEFAULT_UNIT,
    reference: scale.reference || null
  };
}

function isCalibrated(state) {
  return readScale(state) !== null;
}

/*
 * Establish the document scale from a measured distance.
 *
 * The user points at something whose real length they know, and
 * says what that length is. The scale follows directly:
 *
 *     mm per drawing unit = real mm / measured drawing units
 *
 * A measured distance of zero is refused. It has no answer, and
 * accepting it would store a scale of zero or infinity, which
 * would then make every other length in the document
 * unrepresentable.
 */
function calibrate(state, measuredUnits, realValue, unit) {
  const measured = Number(measuredUnits);
  const real = Number(realValue);

  if (!Number.isFinite(measured) || Math.abs(measured) < 1e-9) {
    return {
      ok: false,
      reason: "Pick something with a length first"
    };
  }

  if (!Number.isFinite(real) || real <= 0) {
    return {
      ok: false,
      reason: "Enter a length greater than zero"
    };
  }

  const chosen = UNITS[unit] ? unit : DEFAULT_UNIT;

  /*
   * The real value is converted to millimetres ONCE, and the
   * scale is then stated per millimetre. Storing the scale as
   * mm-per-unit rather than as "real / unit" is what lets a
   * dimension be shown in cm or m without re-deriving anything,
   * and without the error that repeated conversion would
   * accumulate.
   */
  const mmPerUnit = (real * UNITS[chosen].mm) / measured;

  state.scale = {
    mmPerUnit,
    unit: chosen,
    reference: {
      drawingUnits: measured,
      realValue: real,
      unit: chosen
    }
  };

  return {
    ok: true,
    mmPerUnit,
    unit: chosen
  };
}

/*
 * A stored length in drawing units, expressed in the document's
 * units.
 */
function toEngineering(state, drawingUnits) {
  const value = Number(drawingUnits);

  if (!Number.isFinite(value)) {
    return 0;
  }

  const scale = readScale(state);

  /*
   * An uncalibrated drawing falls back to the one-to-one
   * assumption rather than refusing to measure. The panel shows
   * the scale's state, so the user can see these numbers are
   * provisional and calibrate when they need to.
   */
    const mmPerUnit = scale ? scale.mmPerUnit : DEFAULT_MM_PER_UNIT;

    const chosen = scale ? scale.unit : DEFAULT_UNIT;

    /*
     * mmPerUnit is ALREADY the millimetres each drawing unit is
     * worth, so the product is millimetres. Converting from
     * millimetres into the display unit is the only step needed.
     *
     * Dividing by the unit's millimetre value as well would convert
     * twice: 100 units at 5 mm each is 500 mm, which is 50 cm and
     * not 500 cm. The earlier draft made exactly that mistake, and
     * the round trip was the thing that caught it.
     */
    const millimetres = value * mmPerUnit;

    return {
      value: millimetres / UNITS[chosen].mm,
      unit: chosen,
      calibrated: scale !== null
    };
  }

/*
 * A number the user typed in the document's units, back into
 * drawing units.
 *
 * This is the inverse of toEngineering, and it is the only place
 * a typed length becomes geometry - so a feature is moved by a
 * conversion rather than by the value being copied straight in as
 * though it were already drawing units.
 */
function fromEngineering(state, value, unit) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const scale = readScale(state);

  const mmPerUnit =
    scale ? scale.mmPerUnit : DEFAULT_MM_PER_UNIT;

  const chosen = UNITS[unit]
    ? unit
    : scale
      ? scale.unit
      : DEFAULT_UNIT;

  return (
    (number * UNITS[chosen].mm) / mmPerUnit
  );
}

/*
 * The distance between two points, in the document's units.
 */
function measure(state, first, second) {
  if (
      !first ||
      !second ||
      !Number.isFinite(first.x) ||
      !Number.isFinite(second.x) ||
      !Number.isFinite(first.y) ||
      !Number.isFinite(second.y)
  ) {
    return toEngineering(state, 0);
  }

  return toEngineering(
    state,
    Math.hypot(
      second.x - first.x,
      second.y - first.y
    )
  );
}

/*
 * The component parts of a measurement, for a dimension that
 * states them separately.
 *
 * A drawing usually wants the horizontal and vertical distances
 * rather than the diagonal, and when both are zero a measurement
 * is pure diagonal. They are computed from the same conversion,
 * so the parts always add up to the whole.
 */
function measureComponents(state, first, second) {
  const horizontal = toEngineering(
    state,
    Math.abs((second?.x ?? 0) - (first?.x ?? 0))
  );

  const vertical = toEngineering(
    state,
    Math.abs((second?.y ?? 0) - (first?.y ?? 0))
  );

  return { horizontal, vertical };
}

const enggDimensions = {
  DEFAULT_MM_PER_UNIT,
  DEFAULT_UNIT,
  UNITS,
  calibrate,
  fromEngineering,
  isCalibrated,
  measure,
  measureComponents,
  readScale,
  toEngineering
};

export default enggDimensions;
