/*
 * ============================================================
 * EDITING A DIMENSION CHANGES THE GEOMETRY
 * ============================================================
 *
 * A dimension states a measurement of something else, and once the sheet has
 * a World Scale, typing a value into it is an instruction: MAKE THE GEOMETRY
 * THAT SIZE. This module is that instruction.
 *
 *     typed physical value (mm)
 *            ↓  World Scale
 *     required drawing-space distance
 *            ↓
 *     the source feature's actual geometry moves
 *
 * WHY THIS EXISTS SEPARATELY FROM THE MODEL
 * -----------------------------------------
 * `dimension-model.js` READS: it turns geometry into a number. This module
 * WRITES: it turns a number back into geometry. Keeping them apart means the
 * reading path can never be changed by an editing rule, which is what stops
 * a dimension's displayed value and its geometry from drifting.
 *
 * THE TWO LEGITIMATE ACTS, AND WHEN EACH APPLIES
 * ----------------------------------------------
 *   UNCALIBRATED sheet - this is the FIRST dimension
 *       The typed value CALIBRATES the document. There is no scale yet, so
 *       there is nothing to convert through, and the number defines what the
 *       drawn geometry means. Geometry is not touched.
 *
 *   CALIBRATED sheet - a scale already exists
 *       The typed value EDITS the geometry, through the established scale.
 *       The sheet's scale is never changed here: only the first dimension
 *       calibrates.
 *
 * THE WRITER IS SHARED
 * --------------------
 * Geometry is moved through `updateFeatureProperty` - the same setter the
 * Features panel and the creation popup use - so a size set by a dimension, a
 * size typed in the panel and a size typed at creation cannot disagree. That
 * setter's contract is millimetres and it performs the ONE conversion into
 * world units, so this module passes millimetres and never converts itself.
 */

import enggDimensionModel from "./dimension-model.js";
import { updateFeatureProperty } from "../../editor/property-update.js";

/* The reference kinds, from the model that defines them. */
const REFERENCE_KINDS = enggDimensionModel.REFERENCE_KINDS;
/*
 * The anchor a dimension's SECOND reference names, when the first is the
 * anchor that should move.
 *
 * A measurement between two points of the SAME feature - the two ends of a
 * beam, two corners of a rectangle - is edited by moving the far one and
 * leaving the near one pinned, which is the same anchor rule the Features
 * panel uses for a Length. Moving both would keep the measurement right and
 * slide the whole feature, which is not what a student typing a new length
 * means.
 */
function movableReference(dimension) {
  const references = dimension?.sourceRefs || [];

  /*
   * A PROPERTY REFERENCE IS A LEGAL ANSWER, AND IT IS A COMMON ONE.
   *
   * A circle's diameter and a shaft's diameter are stored as the feature's
   * own value rather than as a distance between two anchors - there is no
   * pair of points on a centreline that IS the diameter. So such a dimension
   * carries a `property` reference and no anchor at all.
   *
   * Filtering those out - which is what this did - left a diameter dimension
   * with no movable reference, so it reported itself as uneditable even
   * though a circle's size is the single most obviously editable measurement
   * in the system.
   */
  const property = references.find(
    (reference) =>
      reference && reference.kind === REFERENCE_KINDS.property,
  );

  if (property) {
    return property;
  }

  const anchors = references.filter(
    (reference) => reference && reference.anchor,
  );

  if (!anchors.length) {
    return null;
  }

  /*
   * The LAST anchor moves and the first stays. A dimension placed by picking
   * one end and then the other is read in the order it was made, so the
   * first pick is the anchor the student already committed to.
   */
  return anchors.length > 1
    ? anchors[anchors.length - 1]
    : anchors[0];
}

/*
 * A named anchor turned into the property key that writes it.
 *
 * The anchors are the measurement layer's vocabulary - `start`, `end`,
 * `center`, `a`, `b`, `c`, `topLeft`, `segment2End` - and the writer's
 * vocabulary is a property key such as `start.x`. This is the one place the
 * two are related.
 *
 * A `segmentNEnd` anchor belongs to a rectangle edge, and a rectangle is
 * resized by its width and height rather than by moving a corner, so those
 * are answered by the size keys below rather than by a coordinate.
 */
function axisKeysFor(anchor) {
  const name = String(anchor || "");

  if (name === "start") {
    return { x: "start.x", y: "start.y" };
  }

  if (name === "end") {
    return { x: "end.x", y: "end.y" };
  }

  if (name === "position") {
    return { x: "position.x", y: "position.y" };
  }

  if (name === "center" || name === "centre") {
    return { x: "center.x", y: "center.y" };
  }

  if (name === "a" || name === "b" || name === "c") {
    const index = { a: 0, b: 1, c: 2 }[name];

    return {
      x: `points.${index}.x`,
      y: `points.${index}.y`,
    };
  }

  return null;
}

/*
 * Whether a feature is resized by its own size property rather than by
 * moving a point.
 *
 * A Circle has no meaningful "start" to move - its size IS its radius. The
 * same is true of an Arc, and of a Rectangle's width and height. These are
 * answered by the size keys, and a coordinate edit would either do nothing
 * or move the whole feature.
 */
function sizeKeyFor(object, dimensionType) {
  if (!object) {
    return null;
  }

  if (object.type === "circle" || object.type === "arc") {
    if (dimensionType === "diameter") {
      return "diameter";
    }

    if (dimensionType === "radius") {
      return "radius";
    }
  }

  if (object.type === "rectangle" || object.type === "rigid-body") {
    if (dimensionType === "horizontal") {
      return "width";
    }

    if (dimensionType === "vertical") {
      return "height";
    }
  }

  /*
   * A shaft states its diameter as a value, so a diameter dimension on one
   * edits that value - exactly as a circle's does.
   */
  if (object.type === "shaft" && dimensionType === "diameter") {
    return "diameter";
  }

  /*
   * A truss's height is its own envelope, not a distance between two of its
   * members.
   */
  if (object.type === "truss" && dimensionType === "vertical") {
    return "height";
  }

  return null;
}

/*
 * A LENGTH MEASUREMENT BECOMES A LENGTH EDIT.
 *
 * A beam's span dimension and a beam's Length field are the same physical
 * quantity, so the dimension is applied through the Length property - which
 * already knows to keep the member's orientation and grow it from its
 * anchored end. Writing the endpoints directly would re-implement that rule
 * here, and two implementations of "make this member longer" is two answers
 * to one question.
 */
function lengthKeyFor(object, dimension) {
  if (!object) {
    return null;
  }

  const type = dimension?.dimensionType;

  const spanShaped =
    object.geometry &&
    object.geometry.start &&
    object.geometry.end;

  if (!spanShaped) {
    return null;
  }

  if (
    type === "linear" ||
    type === "horizontal" ||
    type === "vertical" ||
    type === "aligned"
  ) {
    return "length";
  }

  return null;
}

/*
 * Move the geometry a dimension measures to a new physical size.
 *
 * `millimetres` is the value the student typed, in the sheet's working unit
 * converted to millimetres by the caller - the same contract the Features
 * panel and the creation popup use.
 *
 * Returns a result describing what happened, so the caller can say so
 * honestly rather than assuming success:
 *
 *   { ok: true,  featureId, key, applied }
 *   { ok: false, reason }
 */
export function applyDimensionValue(dimension, state, millimetres) {
  const value = Number(millimetres);

  if (!Number.isFinite(value)) {
    return { ok: false, reason: "not-a-number" };
  }

  const reference = movableReference(dimension);

  if (!reference) {
    return { ok: false, reason: "no-reference" };
  }

  const object = (state?.objects || []).find(
    (candidate) => candidate.id === reference.featureId,
  );

  if (!object) {
    return { ok: false, reason: "missing-source" };
  }

  const dimensionType = dimension?.dimensionType;

  /*
   * A CIRCULAR OR SIZE DIMENSION EDITS THE FEATURE'S OWN SIZE VALUE.
   * These are answered first, because a circle has no endpoint to move and
   * a rectangle is resized rather than cornered.
   */
  const sizeKey = sizeKeyFor(object, dimensionType);

  if (sizeKey) {
    const moved = updateFeatureProperty(object, sizeKey, value);

    return moved
      ? { ok: true, featureId: object.id, key: sizeKey, applied: value }
      : { ok: false, reason: "refused" };
  }

  /*
   * A SPAN DIMENSION EDITS THE MEMBER'S LENGTH.
   * A beam, a line, a cable and a shaft are all made longer the same way,
   * and that way already exists.
   */
  const lengthKey = lengthKeyFor(object, dimension);

  if (lengthKey) {
    const moved = updateFeatureProperty(object, lengthKey, value);

    return moved
      ? { ok: true, featureId: object.id, key: lengthKey, applied: value }
      : { ok: false, reason: "refused" };
  }

  /*
   * A TRIANGLE'S SIDE IS EDITED BY THE SIDE'S OWN NAME.
   *
   * The dimension names the clicked edge as `segment{i}Start`, so that is
   * the key to write. The triangle branch in the setter turns it into the
   * triangle's `side{i}` property, which already knows how to move the far
   * vertex - so the side the student clicked is the side that changes, and
   * the other two follow the triangle's existing rules.
   *
   * This is checked BEFORE the generic axis mapping below, because a
   * triangle edge's anchor is a segment name rather than `start`/`end`, and
   * the generic path would not recognise it.
   */
  if (object.type === "triangle") {
    const segment = /^segment(\d)(Start|End|Mid)$/.exec(
      String(reference.anchor || ""),
    );

    if (segment) {
      const key = `segment${segment[1]}Start`;

      const moved = updateFeatureProperty(object, key, value);

      return moved
        ? { ok: true, featureId: object.id, key, applied: value }
        : { ok: false, reason: "refused" };
    }
  }

  /*
   * OTHERWISE THE MEASUREMENT IS BETWEEN TWO PLACES, so the movable end is
   * moved along the axis the dimension states. A horizontal dimension moves
   * only X and a vertical one only Y, which is what makes the measurement
   * change by exactly the amount asked for.
   */
  const keys = axisKeysFor(reference.anchor);

  if (!keys) {
    return { ok: false, reason: "unsupported-anchor" };
  }

  const axis =
    dimensionType === "vertical" ? "y" : dimensionType === "horizontal" ? "x" : null;

  if (axis) {
    const moved = updateFeatureProperty(object, keys[axis], value);

    return moved
      ? { ok: true, featureId: object.id, key: keys[axis], applied: value }
      : { ok: false, reason: "refused" };
  }

  return { ok: false, reason: "unsupported-type" };
}

/*
 * Can this dimension be edited as a size, or is it a reading only?
 *
 * An angle between two features, a point-to-line distance and an arc length
 * are all real measurements, but none of them is a single feature's own
 * dimension that a typed value can move without deciding which of two
 * features gives way. Those are reported as not editable rather than being
 * silently accepted and doing nothing.
 */
export function dimensionEditable(dimension, state) {
  const reference = movableReference(dimension);

  if (!reference) {
    return false;
  }

  const object = (state?.objects || []).find(
    (candidate) => candidate.id === reference.featureId,
  );

  if (!object) {
    return false;
  }

  const dimensionType = dimension?.dimensionType;

  if (sizeKeyFor(object, dimensionType)) {
    return true;
  }

  if (lengthKeyFor(object, dimension)) {
    return true;
  }

  const keys = axisKeysFor(reference.anchor);

  if (keys && (dimensionType === "horizontal" || dimensionType === "vertical")) {
    return true;
  }

  /*
   * A TRIANGLE EDGE IS EDITABLE BY ITS OWN NAME. The anchor is a segment
   * name rather than a coordinate, so `axisKeysFor` does not recognise it -
   * but the setter does, and that is what decides whether a typed value can
   * move the side the student clicked.
   */
  if (
    object.type === "triangle" &&
    /^segment(\d)(Start|End|Mid)$/.test(String(reference.anchor || ""))
  ) {
    return true;
  }

  return false;
}

/*
 * The physical value a dimension currently states, in millimetres, for
 * pre-filling an edit field. Read through the measurement layer so the number
 * offered is the number shown.
 */
export function dimensionMillimetres(measurement) {
  if (!measurement || !Number.isFinite(Number(measurement.value))) {
    return null;
  }

  const unit = measurement.unit || "mm";

  const mmPerUnit = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[unit] ?? 1;

  return Number(measurement.value) * mmPerUnit;
}

const enggDimensionEdit = {
  applyDimensionValue,
  dimensionEditable,
  dimensionMillimetres,
};

export default enggDimensionEdit;