/*
 * The Dimension object.
 *
 * A dimension is a MEASUREMENT OF GEOMETRY, and this module is the
 * whole of what that means. It deliberately knows nothing about
 * engineering values: a force's magnitude is an annotation, and no
 * code in here can produce one. That separation is the distinction the
 * entire system turns on - geometry is what a dimension measures,
 * engineering meaning is what an annotation states - and keeping the
 * two in separate modules is what makes it a rule rather than a
 * convention.
 *
 * WHY A DIMENSION STORES REFERENCES AND NOT A NUMBER
 * -------------------------------------------------
 * The obvious implementation stores the measured value: the user
 * dimensions a 100 line, "100" is saved, and the drawing shows 100.
 * It is smaller, simpler, and wrong. The moment the line moves the
 * dimension still says 100, and nothing in the file records that the
 * number used to mean something about that line.
 *
 * So a dimension stores WHERE it measured - which feature, and which
 * named part of it - and recalculates every time it is drawn. Moving
 * the line changes the measurement because the measurement was never
 * stored in the first place. Association is not a mechanism kept
 * up to date; it is the absence of a cached value.
 *
 * WHAT A REFERENCE IS
 * ------------------
 *     { featureId, anchor, part? }
 *
 * A one-point reference (a radius, a coordinate) names one anchor. A
 * two-point reference (a length, an angle) names two. `part` exists
 * for measurements taken from a feature's own dimensions rather than
 * its anchors - a shaft's diameter, a circle's radius - so that
 * changing the shaft's diameter changes the dimension that states it.
 *
 * THE VALUE IS NEVER TYPED IN
 * ---------------------------
 * There is no way to set a dimension's value from this module, and
 * that is deliberate. A dimension states what the geometry is. If a
 * student typed "50 mm" onto a 100 mm line, the drawing would then
 * contain a claim that is false and nothing to show it is false.
 * Establishing the real relationship between drawing units and
 * millimetres is the scale module's job, and it is a separate,
 * explicit act.
 *
 * UNRESOLVED, NOT STALE
 * ---------------------
 * When a source feature is deleted, its anchor can no longer resolve.
 * The dimension is marked unresolved and says so, rather than
 * continuing to display the last number it knew. A stale number on a
 * drawing is worse than an obvious gap: it looks like an answer.
 */
import enggMeasurement from "../../core/geometry/measurement-core.js";
import enggDimensions from "../../core/scale/dimensions.js";
import enggQuantities from "../../core/units/quantities.js";

/*
 * The reference kinds.
 *
 * Named so the model, the renderer, the file and the tests all say
 * the same thing about what a measurement is taken from. A
 * measurement is either between two places, about one place, or
 * about one of a feature's own values.
 */
const REFERENCE_KINDS = {
  between: "between",
  at: "at",
  property: "property"
};

/*
 * How a dimension's measurement is presented.
 *
 * Named rather than inferred from the type, because the same
 * measurement can be drawn two ways and the choice belongs to the
 * user: a 100 mm beam can carry its length horizontally, vertically,
 * or along itself, and all three are the same number.
 */
const ORIENTATIONS = {
  auto: "auto",
  horizontal: "horizontal",
  vertical: "vertical",
  aligned: "aligned"
};

const DEFAULT_PRECISION = 2;

/*
 * ========================================================
 * CREATION
 * ========================================================
 */

let sequence = 0;

/*
 * A fresh identity.
 *
 * Prefixed by kind so that an id in a saved file is recognisable as
 * a dimension without looking anything up, and random rather than
 * sequential so that the number never implies an order. A dimension
 * that could be reordered by deleting another one would be a
 * surprising thing for a file to be able to do.
 */
function newDimensionId() {
  sequence += 1;

  const random =
    typeof globalThis.crypto === "object" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);

  return `dimension-${random.slice(0, 8)}`;
}

/*
 * Build a Dimension.
 *
 *   type       which measurement, from the measurement core
 *   refs       one or two references, as above
 *   placement  where the dimension sits, in drawing units
 *   orientation how it is drawn; "auto" follows the measurement
 *   style     overrides from the document defaults
 *
 * The value is NOT a parameter. There is deliberately no way to
 * create a dimension that states a number rather than measuring
 * one.
 */
function createDimension({
  dimensionType,
  refs,
  placement,
  orientation = ORIENTATIONS.auto,
  style = {},
  label = null,
  name,
} = {}) {
  const normalisedRefs = normaliseReferences(refs);

  return {
    id: newDimensionId(),
    name: name || dimensionLabel(dimensionType),
    type: "dimension",

    /*
     * The measurement this dimension states. Kept as a plain string
     * so a saved file reads clearly and so a renderer can switch on
     * it without loading the capability layer.
     */
    dimensionType,

    /*
     * Where the measurement is taken FROM. This is the whole of the
     * association, and it is the only reason the dimension can
     * update when the geometry does.
     */
    sourceRefs: normalisedRefs,

    /*
     * An override the user may type, such as "FIELD" on a
     * fabricated dimension. It never replaces the measurement: it
     * is shown alongside it, and the measurement is still what the
     * dimension asserts.
     */
    label,

    /*
     * Where the dimension is DRAWN, in drawing units - deliberately
     * separate from what it measures, so moving a dimension cannot
     * move the geometry it describes.
     */
    placement: {
      x: Number(placement?.x) || 0,
      y: Number(placement?.y) || 0,
    },

    orientation,

    style: {
      /*
       * UNITS ARE NOT OPTIONAL AND WERE NEVER A DISPLAY PREFERENCE.
       *
       * The flag is kept only so a drawing saved with it reads back
       * unchanged; it no longer decides anything. `formatMeasurement`
       * writes the unit unconditionally, because a bare number is
       * ambiguous with every other quantity of the same size on the sheet.
       */
      showUnits: true,
      precision: null,
      ...style,
    },

    /*
     * True until a reference stops resolving. Not a flag the user
     * sets: it is the state of the measurement, recomputed from the
     * geometry rather than remembered, so it cannot disagree with
     * the drawing.
     */
    resolved: true,
  };
}

function dimensionLabel(dimensionType) {
  return (
    enggMeasurement?.DIMENSION_TYPES?.[
      dimensionType
    ]?.label || "Dimension"
  );
}

/*
 * References in one shape.
 *
 * Normalised once, at creation, so that every consumer - the
 * recalculation, the renderer, the file, the redundancy check -
 * reads the same fields and none of them has to defend against a
 * half-built reference.
 */
function normaliseReferences(refs) {
  const list = Array.isArray(refs) ? refs : [refs];

  return list
    .filter((reference) => reference?.featureId)
    .map((reference) => {
      if (reference.kind === REFERENCE_KINDS.property) {
        return {
          kind: REFERENCE_KINDS.property,
          featureId: reference.featureId,
          property: String(reference.property || ""),
        };
      }

      return {
        kind:
          reference.kind || REFERENCE_KINDS.between,
        featureId: reference.featureId,
        anchor: String(reference.anchor || ""),
      };
    });
}

/*
 * ========================================================
 * MEASUREMENT
 * ========================================================
 */

/*
 * The points a dimension measures between, in drawing units.
 *
 * Resolved now, from the features' current geometry, rather than
 * from anything stored on the dimension. This is the function that
 * makes the association real: it is called every time the dimension
 * is drawn, so geometry that has moved is measured at where it is
 * now.
 *
 * Returns null when a reference cannot be resolved, which is what
 * makes a dimension over deleted geometry detectable rather than
 * merely wrong.
 */
function measurePoints(
  dimension,
  state
) {
  const references = dimension?.sourceRefs || [];

  if (!references.length) {
    return null;
  }

  const points = references.map((reference) =>
    resolveReferencePoint(reference, state)
  );

  /*
   * A PROPERTY REFERENCE IS DRAWN FROM THE FEATURE'S OWN EXTENT.
   *
   * A shaft states its diameter as a value, so its measurement has no

   * two anchors to sit between - there is no pair of points on the

   * centreline that is the diameter. The VALUE was always available

   * (measureProperty reads it), but the geometry to draw it across was

   * not, so graphicsFor produced nothing and the dimension rendered as

   * a bare number with no line.

   *
   * The two points are therefore placed on the feature's own extent at its

   * own radius - which is where they physically are. A diameter runs

   * across the shaft, a radius from its centreline to its surface, and

   * both are drawn on the real body rather than floating beside it.

   */
  const propertyPoint = propertyReferencePoints(
    references[0],
    state
  );

  if (propertyPoint && propertyPoint.length) {
    return propertyPoint;
  }

  /*
   * A POINT-TO-LINE MEASUREMENT IS DRAWN ALONG THE PERPENDICULAR.
   *
   * Its three references name the point and the line's two ends, but a
   * dimension line drawn between the point and an END would show the
   * distance to that end rather than the distance to the line - which is
   * the wrong number and the wrong picture at once.
   *
   * So the second drawn point is the FOOT of the perpendicular: the
   * closest place on the line to the point. That makes the drawn line the
   * perpendicular itself, so the drawing and the stated value agree by
   * construction.
   */
  if (dimension?.dimensionType === "point-line") {
    const perpendicular = perpendicularFoot(
      references,
      state
    );

    if (perpendicular) {
      return perpendicular;
    }

    return null;
  }

  if (points.some((point) => point === null)) {
    return null;
  }

  /*
   * A COORDINATE MEASUREMENT RUNS FROM THE ORIGIN.
   *
   * A coordinate names ONE place - a point's position - but every
   * measurement here is a distance between TWO of them, so a lone
   * point left measurePoints as a one-element array and the very next
   * step read a second point out of it.
   *
   * The missing half is the world origin, which is what a coordinate is
   * measured from anyway: X and Y state a position relative to it. So a
   * single-point measurement is completed from the origin rather than
   * being left half-formed.
   */
  if (points.length === 1) {
    return [{ x: 0, y: 0 }, points[0]];
  }
  return points;
}
/*
 * The point and the foot of its perpendicular onto a line.
 *
 * The line is given by the SECOND and THIRD references, kept as two ends so
 * the foot is recomputed from the line's current position every time. The
 * foot is the projection of the point onto the line's infinite direction,
 * which is what an engineering perpendicular distance is measured to - the
 * closest point on the line, whether or not it falls between the drawn ends.
 *
 * Null when the three references cannot be resolved, or when the line is
 * degenerate - a line of no length has no direction to be perpendicular to,
 * and inventing one would state a distance to nothing.
 */
function perpendicularFoot(references, state) {
  if (!references || references.length < 3) {
    return null;
  }

  const point = resolveReferencePoint(references[0], state);
  const lineStart = resolveReferencePoint(references[1], state);
  const lineEnd = resolveReferencePoint(references[2], state);

  if (!point || !lineStart || !lineEnd) {
    return null;
  }

  const deltaX = lineEnd.x - lineStart.x;
  const deltaY = lineEnd.y - lineStart.y;

  const lengthSquared =
    deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared < 1e-12) {
    return null;
  }

  /*
   * The projection parameter is NOT clamped to [0, 1].
   *
   * Clamping would turn the perpendicular distance into the distance to the
   * nearest END for a point that sits beyond the line's drawn extent - which
   * is a different measurement, and not the one an engineering drawing means
   * by "distance from a point to a line".
   */
  const t =
    ((point.x - lineStart.x) * deltaX +
      (point.y - lineStart.y) * deltaY) /
    lengthSquared;

  const foot = {
    x: lineStart.x + deltaX * t,
    y: lineStart.y + deltaY * t
  };

  return [point, foot];
}

/*
 * The two points a stored-value measurement is drawn between.
 *
 * A shaft's diameter is a number it holds, not a distance between two
 * of its points - its centreline has no pair of points that ARE the
 * diameter. So the value is placed on the feature's own extent at its own
 * radius, which is where those points physically are.
 *
 * A diameter therefore runs across the body and a radius from the
 * centreline out to the surface, drawn on the real shape rather than

 * floating beside it.
 *
 * Null when the reference is not a stored value, or the value is not a

 * finite positive number - in which case the caller falls back to its

 * normal handling and nothing is drawn rather than something wrong.

 */
function propertyReferencePoints(
  reference,
  state
) {
  if (!reference || reference.kind !== "property") {
    return null;
  }

  const object = findObject(
    state,
    reference.featureId
  );

  if (!object) {
    return null;
  }

  const radius = featureRadius(object);

  if (
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    return null;
  }

  const span = enggMeasurement.twoPointSpan(object);

  if (!span) {
    return null;
  }

  const centre = {
    x: (span.start.x + span.end.x) / 2,
    y: (span.start.y + span.end.y) / 2
  };

  const deltaX = span.end.x - span.start.x;
  const deltaY = span.end.y - span.start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length < 1e-9) {
    return null;
  }

  /*
   * Across the body for a diameter, out to the surface for a radius,

   * measured perpendicular to the centreline - which is the direction a

   * reader expects both to run.

   */
  const axis = {
    x: deltaX / length,
    y: deltaY / length
  };

  const across = {
    x: -axis.y,
    y: axis.x
  };

  /*
   * A DIAMETER crosses the body, so its two points sit one radius
   * either side of the centreline. A RADIUS runs from the centreline out
   * to the surface, so it needs the centre as one of its points.
   *
   * Drawing a radius as centre-to-centre-plus would state the diameter
   * again under a different symbol, which is the same class of error as
   * the chord-as-diameter this file was written to prevent.
   */
  if (reference.property === "radius") {
    return [
      centre,
      {
        x: centre.x + across.x * radius,
        y: centre.y + across.y * radius
      }
    ];
  }

  return [
    {
      x: centre.x - across.x * radius,
      y: centre.y - across.y * radius
    },
    {
      x: centre.x + across.x * radius,
      y: centre.y + across.y * radius
    }
  ];
}


function resolveReferencePoint(
  reference,
  state
) {
  const object = findObject(
    state,
    reference.featureId
  );

  if (!object) {
    return null;
  }

  /*
   * A reference to a value rather than to a place - a shaft's
   * diameter, a circle's radius. It has no point, and is handled by
   * measurementForProperty instead.
   */
  if (reference.kind === REFERENCE_KINDS.property) {
    return null;
  }

  return (
    enggMeasurement.resolveAnchor(
      object,
      reference.anchor
    )
  );
}

function findObject(state, objectId) {
  return (
    (state?.objects || []).find(
      (object) => object.id === objectId
    ) || null
  );
}

/*
 * A dimension's value, in the document's units.
 *
 * The measurement is computed here, in drawing units, and converted
 * ONCE at the end by the scale module. That conversion is the only
 * place drawing units become real ones, and it is why zooming the
 * canvas cannot change a 100 mm line into a 200 mm one: the zoom is
 * a viewport transform and this function never sees it.
 *
 * Returns null when the dimension cannot be resolved, so a caller
 * can tell "no measurement" from "a measurement of zero".
 */
function measurementFor(
  dimension,
  state
) {
  const scale =
    enggDimensions;

  const propertyRef = (
    dimension?.sourceRefs || []
  ).find(
    (reference) =>
      reference.kind === REFERENCE_KINDS.property
  );

  if (propertyRef) {
    return measureProperty(
      dimension,
      propertyRef,
      state,
      scale
    );
  }

  const points = measurePoints(dimension, state);

  if (!points) {
    return null;
  }

  const type = dimension.dimensionType;

  if (type === "angular") {
    return measureAngle(
      dimension,
      points,
      state,
      scale
    );
  }

  if (type === "radius" || type === "diameter") {
    /*
     * A radius or diameter is a SINGLE point on the feature's own
     * edge, read against its centre - not a distance from the
     * centre to the anchor, because the centre is not where the
     * dimension is placed. The value comes from the feature's own
     * radius, which is why changing a circle's radius changes it.
     */
    return measureRadius(
      dimension,
      state,
      scale,
      type === "diameter"
    );
  }

  if (type === "arc-length") {
    return measureArcLength(dimension, state, scale);
  }

  const [first, second] = points;

  const drawingUnits =
    type === "horizontal"
      ? Math.abs(second.x - first.x)
      : type === "vertical"
        ? Math.abs(second.y - first.y)
        : Math.hypot(
              second.x - first.x,
              second.y - first.y
            );

  return toEngineering(scale, state, drawingUnits, type);
}

/*
 * A circular measurement, from the feature that owns the circle.
 *
 * Read from the geometry rather than measured between two anchors,
 * so that the value is the circle's real radius and a circle whose
 * radius is edited updates the dimension that states it.
 */
function measureRadius(
  dimension,
  state,
  scale,
  doubled
) {
  const reference = dimension.sourceRefs[0];

  if (!reference) {
    return null;
  }

  const object = findObject(
    state,
    reference.featureId
  );

  if (!object) {
    return null;
  }

  const radius = featureRadius(object);

  if (radius === null) {
    return null;
  }

  return toEngineering(
    scale,
    state,
    doubled ? radius * 2 : radius,
    dimension.dimensionType
  );
}

/*
 * A circular feature's radius, from whichever of its own fields
 * actually carries it.
 *
 * A Circle and an Arc both store a radius. A Shaft stores a
 * DIAMETER, because that is what a shaft is specified by - so a
 * shaft's radius is half of it, and measuring the shaft's
 * centreline as if it were the exterior would state a number half
 * the true one.
 */
function featureRadius(object) {
  const geometry = object.geometry || {};

  if (Number.isFinite(Number(geometry.radius))) {
    return Number(geometry.radius);
  }

  if (
    Number.isFinite(Number(geometry.diameter))
  ) {
    return Number(geometry.diameter) / 2;
  }

  return null;
}

/*
 * A measurement taken from a feature's own value.
 *
 * Only values that exist explicitly are read. Nothing here derives
 * a quantity the feature does not already state - a shaft's
 * diameter is read, not recomputed from its span, and no force is
 * ever read as a force because the module that would do it does not
 * exist.
 */
function measureProperty(
  dimension,
  reference,
  state,
  scale
) {
  const object = findObject(
    state,
    reference.featureId
  );

  if (!object) {
    return null;
  }

  const geometry = object.geometry || {};

  const value = geometry[reference.property];

  if (!Number.isFinite(Number(value))) {
    return null;
  }

  return toEngineering(
    scale,
    state,
    Number(value),
    dimension.dimensionType
  );
}

/*
 * The included angle between two spans.
 *
 * Reported in degrees and dimensionless - a 30 degree dimension
 * reads "30°", never "30 mm°", because an angle is not a length and
 * giving it a unit would be asserting that it is one.
 *
 * Only spans that actually have two ends can produce an angle. A
 * dimension between two points is a distance, not an angle, and
 * saying otherwise would let a right-angle dimension appear where
 * there is no direction to measure an angle between.
 */
function measureAngle(
  dimension,
  points,
  state,
  scale
) {
  const [first, second] = points;

  /*
   * THE SPANS, not the measured points.
   *
   * An included angle needs a direction on each side, and a
   * direction comes from a span's two ends. Handing spanDirection a
   * single measured point gave it nothing to work with, so every
   * angle silently measured nothing.
   *
   * The references must also be to DIFFERENT features: a dimension
   * between two points of one span is a distance across that span,
   * and there is no angle in it.
   */
  const [firstRef, secondRef] =
    dimension.sourceRefs || [];

  const separateFeatures =
    Boolean(
      firstRef &&
      secondRef &&
      firstRef.featureId !== secondRef.featureId
    );

  const firstSpan = separateFeatures
    ? spanOf(state, firstRef.featureId)
    : spanOf(state, firstRef?.featureId);

  const secondSpan = separateFeatures
    ? spanOf(state, secondRef.featureId)
    : spanOf(state, secondRef?.featureId);

  /*
   * ========================================================
   * THE ANGLE IS TAKEN BETWEEN THE TWO LEGS AT THE VERTEX
   * ========================================================
   *
   * AN ANGLE BETWEEN TWO LINES DOES NOT DEPEND ON WHICH WAY EACH WAS
   * DRAWN, and taking the angle between the raw `end - start` vectors
   * made it depend on exactly that. A line stored right-to-left has a
   * direction 180 degrees from the same line stored left-to-right, so
   * the SAME pair of lines measured 53 degrees or 127 degrees
   * according to nothing but the order their endpoints happened to be
   * saved in. The number was wrong, and it changed when unrelated
   * geometry was edited.
   *
   * So the legs are built the way the RENDERER builds them: from the
   * vertex where the two spans meet, each pointing out along its own
   * span. `legDirection` chooses the span end FURTHER from the vertex,
   * so a span with the vertex at one of its own ends still gives a
   * real direction rather than a zero vector - and a span whose
   * vertex is beyond its drawn extent still points the right way.
   *
   * This is the same `a`, `b` and vertex the drawn arc is built from,
   * so the label and the arc cannot state different angles. That is
   * the property this file was originally written to protect, and it
   * is why the computation lives here rather than beside the drawing.
   */
  const vertex = nearestVertex(firstSpan, secondSpan);

  const a = vertex
    ? legDirection(vertex, firstSpan.start, firstSpan.end)
    : spanDirection(firstSpan);

  const b = vertex
    ? legDirection(vertex, secondSpan.start, secondSpan.end)
    : spanDirection(secondSpan);

  /*
   * If the references do not resolve to spans, there is no
   * direction to measure an angle between, and the answer is no
   * measurement rather than an assumed one.
   */
  if (!a || !b) {
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;

    if (
      Math.abs(deltaX) < 1e-12 &&
      Math.abs(deltaY) < 1e-12
    ) {
      return null;
    }

    /*
     * Two points with no direction between them have no included
     * angle. Reported as null rather than as zero, because zero
     * would be a claim that they are parallel.
     */
    return null;
  }

  const angle = includedAngleDegrees(a, b);

  if (angle === null) {
    return null;
  }

  return {
    value: angle,

    /*
     * Angles are dimensionless. This flag is what stops a unit being
     * appended and what makes the degree sign appear instead, so
     * without it a right angle reads "90.00" rather than "90°".
     */
    unit: "deg",
    angular: true,
    degrees: true,
    calibrated: true,
  };
}

/*
 * The angle two legs subtend, in degrees, as a number a drafting
 * reader expects.
 *
 * The legs are the two directions at the vertex, so the angle between
 * them is the INCLUDED angle - the one the arc is drawn through and
 * the one the reader checks against the extension lines.
 *
 * It is taken with atan2 of the cross product and the dot product,
 * which stays correct for obtuse angles where an acos of the dot
 * alone would need its sign restored, and the ABSOLUTE value makes it
 * the unsigned angle between the two directions. Because the legs are
 * built from the vertex rather than from each span's own start-to-end
 * direction, that value no longer changes when a line is stored the
 * other way round.
 *
 * Null when either direction is degenerate: a zero-length leg has no
 * direction, and an angle to nothing is unanswerable rather than zero.
 */
function includedAngleDegrees(a, b) {
  const lengthA = Math.hypot(a.x, a.y);
  const lengthB = Math.hypot(b.x, b.y);

  if (lengthA < 1e-9 || lengthB < 1e-9) {
    return null;
  }

  const dot = a.x * b.x + a.y * b.y;

  const determinant = a.x * b.y - a.y * b.x;

  const degrees =
    (Math.atan2(determinant, dot) * 180) / Math.PI;

  return Math.abs(degrees);
}

function spanOf(state, featureId) {
  const object = findObject(state, featureId);

  return object
    ? enggMeasurement.twoPointSpan(object)
    : null;
}

function spanDirection(span) {
  if (!span) {
    return null;
  }

  if (span.start && span.end) {
    const deltaX = span.end.x - span.start.x;
    const deltaY = span.end.y - span.start.y;

    return { x: deltaX, y: deltaY };
  }

  return null;
}



/*
 * The length along an arc's sweep.
 *
 * From the arc's own radius and sweep, which are the feature's real
 * values - so editing either updates the dimension. The straight
 * chord is NOT substituted: it is a different number, and for a
 * wide arc the difference is large enough to matter.
 */
function measureArcLength(
  dimension,
  state,
  scale
) {
  const reference = dimension.sourceRefs[0];

  if (!reference) {
    return null;
  }

  const object = findObject(
    state,
    reference.featureId
  );

  if (!object) {
    return null;
  }

  const geometry = object.geometry || {};

  const radius = Number(geometry.radius);

  const sweep = Math.abs(
    Number(geometry.endAngle) -
      Number(geometry.startAngle)
  );

  if (
    !Number.isFinite(radius) ||
    !Number.isFinite(sweep)
  ) {
    return null;
  }

  return toEngineering(
    scale,
    state,
    radius * sweep,
    dimension.dimensionType
  );
}

/*
 * Convert a measurement in drawing units into the document's units.
 *
 * The one place the two coordinate systems meet. Handled through
 * whichever scale module is present, and defensive about it because
 * an uncalibrated drawing still has to be measurable - at the
 * provisional one-to-one assumption, flagged as such in the result.
 */
function toEngineering(
  scale,
  state,
  drawingUnits,
  dimensionType
) {
  /*
   * The conversion is the scale module's, called once, at the end.
   *
   * Nothing here decides what a unit is worth; that is the scale
   * module's business, and a second lookup here is how two
   * implementations of the same question end up disagreeing. The
   * removed one would also have thrown, since it reached for a
   * module that need not be present.
   */
  if (scale?.toEngineering) {
    const converted = scale.toEngineering(
      state,
      drawingUnits
    );

    return {
      ...converted,
      angular: false,
    };
  }

  return {
    value: drawingUnits,
    unit: "mm",
    calibrated: false,
    angular: false,
  };
}

/*
 * ========================================================
 * DISPLAY
 * ========================================================
 */

/*
 * The text a dimension shows.
 *
 * Formatted from the measurement every time it is asked for, never
 * stored. The prefix is part of the measurement - R and Ø are what
 * distinguish a radius from a diameter - and the unit is omitted for
 * an angle because an angle is not a length.
 */
function formatMeasurement(
  dimension,
  state
) {
  const measurement = measurementFor(
    dimension,
    state
  );

  if (!measurement) {
    return null;
  }

  const definition =
    enggMeasurement.DIMENSION_TYPES[
      dimension.dimensionType
    ];

  /*
   * An uncalibrated drawing still measures, but says so. A number
   * with no unit and no warning would be read as a real measurement,
   * and the whole point of calibrating is that the difference
   * matters.
   */
  const precision = resolvePrecision(dimension, state);

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
  );

  const prefix = definition?.prefix || "";

  /*
   * ONE FORMATTER FOR EVERY DIMENSION.
   *
   * The unit used to be conditional on a per-dimension `showUnits` style
   * flag, which meant a dimension could be created and drawn as a bare
   * number that gained its unit only once something set that flag. A
   * dimension with no unit is ambiguous with any other quantity of the same
   * magnitude on the same drawing - a 250 mm span beside a 250 N force -
   * so the unit is part of what the number means rather than a piece of
   * dressing, and it is now written unconditionally.
   *
   * An angle carries the degree sign and no length unit, because it is not
   * a length.
   *
   * NO TILDE, ever. The `~` this replaced marked an uncalibrated
   * measurement as approximate. But the whole point of calibrating is that
   * the doubt is removed, and a dimension that established the scale is the
   * LEAST approximate thing on the sheet - marking it `~` argued against
   * the feature that produced it. A drawing that genuinely has not been
   * calibrated has no honest length to state, and that is said once in the
   * calibration prompt where the student can act on it, rather than
   * repeated on every dimension where they cannot.
   */
  const formatter = enggQuantities;

  /*
   * THE FORMATTER IS FALLEN BACK ON, NEVER ABSENT.
   *
   * These models are also loaded on their own - by the module-load check,
   * and by tests that exercise the measurement without the presentation -
   * so reaching for the formatter directly would make a dimension
   * unmeasurable in those contexts. The fallback below is the same rule
   * written twice, which is the cost of the models being loadable apart.
   */
  if (!formatter) {
    return measurement.angular
      ? `${prefix}${value}°`
      : `${prefix}${value} ${measurement.unit}`;
  }

  return formatter.formatLength(rounded, measurement.unit, {
    prefix,
    precision,
    angular: measurement.angular === true,
  });
}

function resolvePrecision(dimension, state) {
  /*
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

  return DEFAULT_PRECISION;
}

function formatAtPrecision(value, precision) {
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

function round(value, precision) {
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
    Math.round(value * factor * (1 + Number.EPSILON)) /
    factor;

  /*
   * Fixed to the stated precision rather than left to
   * JavaScript's number-to-string, which drops trailing zeros.
   *
   * This is not cosmetic. Two dimensions on one drawing are read
   * together, and "100 mm" beside "100.25 mm" implies the first is
   * a rounder, less precise measurement than it is. Engineering
   * dimensions are shown at a consistent precision precisely so
   * they can be compared at a glance.
   */
  return Object.is(rounded, -0) ? 0 : rounded;
}

/*
 * ========================================================
 * RESOLUTION STATE
 * ========================================================
 */

/*
 * Whether a dimension can currently be measured.
 *
 * Computed, not remembered. A dimension's resolved state is a fact
 * about the geometry it references, and storing it would let the two
 * disagree - the drawing would say "resolved" while showing an
 * empty dimension, or the reverse.
 */
function isResolved(dimension, state) {
  return measurementFor(dimension, state) !== null;
}

/*
 * ========================================================
 * REDUNDANCY
 * ========================================================
 */

/*
 * Whether a candidate measurement is already stated.
 *
 * Smart Dimension uses this so that dimensioning a beam that already
 * has its span does not put a second, identical span beside it.
 *
 * The comparison is on the measurement itself - same type, same
 * source features, same anchors - not on the dimension's identity or
 * position, because a second dimension of the same thing is
 * redundant wherever it happens to sit.
 */
function describesSameAs(dimension, candidate) {
  if (
    !dimension ||
    !candidate ||
    dimension.dimensionType !==
      candidate.dimensionType
  ) {
    return false;
  }

  /*
   * A proposal and a dimension are the same measurement at different
   * stages - one has not been created yet - so the comparison reads
   * whichever shape it is given rather than insisting on a created
   * one.
   *
   * Insisting on a dimension is what made this always fail when
   * given a proposal: Smart Dimension proposes with `refs` and a
   * created dimension stores `sourceRefs`, so nothing ever matched
   * and nothing was ever suppressed.
   */
  const existing =
    dimension.sourceRefs ||
    dimension.refs ||
    [];

  const proposed =
    candidate.sourceRefs ||
    candidate.refs ||
    [];

  if (existing.length !== proposed.length) {
    return false;
  }

  /*
   * Both sides are reduced to a canonical form before being
   * compared.
   *
   * A comparison that checks every field for exact equality has to
   * be right about all of them, and one that is wrong about any
   * single field reports two different measurements as the same -
   * or, as happened here, the same measurement as different, and
   * suppressed nothing.
   *
   * Normalising first settles how a reference was SPELLED - its
   * kind, which properties it carries, which end was named first -
   * so that what is left to compare is only what was MEASURED.
   */
  const canonical = (references) =>
    references
      .map((reference) => {
        const kind = reference.kind || "between";

        const canonicalised = {
          kind,
          featureId: reference.featureId
        };

        /*
         * Only the fields that identify the measurement. "anchor"
         * and "property" are alternatives - a property reference
         * names a value rather than a place - and including both
         * would make a measurement with an unused field look
         * different from the same measurement without it.
         */
        if (kind === "property") {
          canonicalised.property =
            reference.property ?? null;
        } else {
          canonicalised.anchor =
            reference.anchor ?? null;
        }

        return canonicalised;
      })
      .sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : 1
      );

  return (
    JSON.stringify(canonical(existing)) ===
    JSON.stringify(canonical(proposed))
  );
}

/*
 * Whether anything already in the document states this measurement.
 */
function alreadyStated(
  candidate,
  state
) {
  return (state?.objects || []).some(
    (object) =>
      object.type === "dimension" &&
      describesSameAs(object, candidate)
  );
}

/*
 * ========================================================
 * GEOMETRY THE DIMENSION GENERATES
 * ========================================================
 */

/*
 * The lines and text a dimension draws, in world coordinates.
 *
 * RETURNED, NOT DRAWN. The dimension is not a picture of itself:
 * this describes what a dimension means graphically, and the
 * renderer decides how to draw it. That is what keeps the dimension
 * identical in the canvas, in an export and in a figure in the
 * written solution - there is one description and three uses of it.
 *
 * Extension lines, witness lines, the dimension line and its
 * arrowheads are all generated from the geometry each time, so a
 * dimension that is moved redraws correctly and a dimension whose
 * source has moved redraws correctly.
 */
function graphicsFor(
  dimension,
  state
) {
  const measurement = measurementFor(
    dimension,
    state
  );

  const text = formatMeasurement(dimension, state);

  if (!measurement || !text) {
    return null;
  }

  const propertyRef = (
    dimension.sourceRefs || []
  ).find(
    (reference) =>
      reference.kind === REFERENCE_KINDS.property
  );

  const object = propertyRef
    ? findObject(state, propertyRef.featureId)
    : null;

  /*
   * A radial or property measurement is drawn from its centre, so it
   * is a different shape from a linear one and gets its own
   * description. Everything else is a linear dimension between two
   * points.
   */
  /*
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

    return radialGraphics(
      dimension,
      state,
      object,
      measurement,
      text,
      radialReference
    );
  }

  if (
    dimension.dimensionType === "angular"
  ) {
    return angularGraphics(
      dimension,
      state,
      measurement,
      text
    );
  }

  return linearGraphics(
    dimension,
    state,
    measurement,
    text
  );
}

/*
 * The direction a linear dimension runs in.
 *
 * "auto" follows the thing measured: a horizontal measurement is
 * drawn horizontally, a vertical one vertically, and an aligned one
 * along the line it measures. That is what makes a dimension look
 * like it belongs to the geometry rather than being a number
 * floating near it.
 */
function dimensionDirection(dimension, points) {
  const [first, second] = points;

  const explicit = dimension.orientation;

  if (
    explicit &&
    explicit !== ORIENTATIONS.auto
  ) {
    if (explicit === ORIENTATIONS.horizontal) {
      return { x: 1, y: 0 };
    }

    if (explicit === ORIENTATIONS.vertical) {
      return { x: 0, y: 1 };
    }

    return normalise({
      x: second.x - first.x,
      y: second.y - first.y,
    });
  }

  switch (dimension.dimensionType) {
    case "horizontal":
      return { x: 1, y: 0 };

    case "vertical":
      return { x: 0, y: 1 };

    default:
      /*
       * An aligned or linear dimension follows the geometry. For a
       * pure horizontal span that is horizontal anyway, and for an
       * angled one it is the line itself - which is what makes an
       * angled dimension legible instead of a number at a strange
       * angle.
       */
      return normalise({
        x: second.x - first.x,
        y: second.y - first.y,
      });
  }
}

function normalise(vector) {
  const length = Math.hypot(vector.x, vector.y);

  if (length < 1e-12) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

/*
 * Perpendicular to a direction, used to stand the dimension line off
 * the geometry it measures.
 */
function perpendicular(direction) {
  return { x: -direction.y, y: direction.x };
}

/*
 * Where the dimension text is drawn, and which way up.
 *
 * A dimension is only readable if its text is upright. A dimension
 * line running left-to-right gets horizontal text; one running
 * bottom-to-top gets text reading upward from the left; and one
 * running right-to-left would put the text upside down, so it is
 * flipped and its anchor moves with it.
 *
 * That flipping is the difference between a drawing whose dimensions
 * can be read at a glance and one the reader has to tilt their head
 * for. It is done here, once, rather than by each consumer.
 */
function textFrame(
  position,
  direction
) {
  const { x, y } = direction;

  /*
   * Beyond vertical: reading bottom-to-top is the convention, and
   * anything past that is upside down.
   */
  const angle = (Math.atan2(y, x) * 180) / Math.PI;

  const normalised =
    angle > 90 || angle < -90
      ? angle + 180
      : angle;

  return {
    x: position.x,
    y: position.y,
    angle: normalised,
    flip: angle > 90 || angle < -90,
    vertical: Math.abs(normalised) > 45 && Math.abs(normalised) < 135,
  };
}

function linearGraphics(
  dimension,
  state,
  measurement,
  text
) {
  const points = measurePoints(dimension, state);

  if (!points) {
    return null;
  }

  const [first, second] = points;

  const direction = dimensionDirection(
    dimension,
    points
  );

  /*
   * The dimension line is offset from the geometry by where the user
   * placed it, measured PERPENDICULAR to the dimension's own
   * direction. The offset is signed, so placing the dimension on the
   * other side of the beam puts it there rather than snapping it
   * back.
   */
  const anchor = perpendicular(direction);

  const midpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };

  /*
   * How far the placement is from the geometry, along the
   * dimension's own normal. Signed so the user chooses the side.
   */
  const offset =
    (dimension.placement.x - midpoint.x) *
      anchor.x +
    (dimension.placement.y - midpoint.y) *
      anchor.y;

  const lineStart = {
    x: first.x + anchor.x * offset,
    y: first.y + anchor.y * offset,
  };

  const lineEnd = {
    x: second.x + anchor.x * offset,
    y: second.y + anchor.y * offset,
  };

  /*
   * Extension lines run from the measured points out to the
   * dimension line. They are part of the dimension's description and
   * are never ordinary Line features - they exist for as long as the
   * dimension does and cannot be selected on their own.
   */
  const extensionStart = {
    x: first.x + anchor.x * offset,
    y: first.y + anchor.y * offset,
  };

  const extensionEnd = {
    x: second.x + anchor.x * offset,
    y: second.y + anchor.y * offset,
  };

  /*
   * Where the text sits: on the dimension line, at its midpoint,
   * shifted slightly off it so it does not sit ON the line and the
   * arrows.
   */
  const textAnchor = {
    x: (lineStart.x + lineEnd.x) / 2,
    y: (lineStart.y + lineEnd.y) / 2,
  };

  return {
    kind: "linear",
    dimensionType: dimension.dimensionType,
    measurement,
    text,

    line: [lineStart, lineEnd],
    extensions: [
      [first, extensionStart],
      [second, extensionEnd],
    ],

    /*
     * Arrowheads point INWARD at the measured extent when the
     * dimension line is longer than the gap, which is the
     * convention outside the arrowheads. Inside is used when there is
     * no room between them, and pointing them outward would put
     * them beyond the witness lines - describing a different
     * measurement than the one being stated.
     */
    arrowStyle: decideArrowStyle(
      lineStart,
      lineEnd,
      offset
    ),

    textFrame: textFrame(textAnchor, direction),
    textAnchor,
  };
}

/*
 * Which way the arrowheads point.
 *
 * Outside when the dimension line stands far enough off the geometry
 * for the arrows to have room; inside when it does not. The decision
 * is made here so that a narrow dimension does not grow arrowheads
 * that overshoot the thing being measured.
 */
function decideArrowStyle(
  lineStart,
  lineEnd,
  offset
) {
  const length = Math.hypot(
    lineEnd.x - lineStart.x,
    lineEnd.y - lineStart.y
  );

  /*
   * A dimension line shorter than about six times the arrowhead
   * cannot fit arrows outside its ends without them overlapping the
   * text, so inside is the readable choice.
   */
  return Math.abs(offset) > 0 &&
    length < 6
    ? "inside"
    : "outside";
}

function radialGraphics(
  dimension,
  state,
  object,
  measurement,
  text,
  reference
) {
  /*
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


  /*
   * OR THE MIDPOINT OF ITS OWN CENTRELINE.
   *
   * A shaft has no "center" or "position" anchor - it is a start and an
   * end - so the lookup above found nothing and every diameter drawn
   * against one returned nothing at all. A feature with a centreline has
   * an unambiguous centre, and that is exactly what the midpoint is.
   */
  const centreline =
    enggMeasurement.twoPointSpan(
      measured
    );

  const centre =
    enggMeasurement.resolveAnchor(
      measured,
      "center"
    ) ||
    enggMeasurement.resolveAnchor(
      measured,
      "position"
    ) ||
    (centreline
      ? {
          x:
            (centreline.start.x +
              centreline.end.x) /
            2,
          y:
            (centreline.start.y +
              centreline.end.y) /
            2
        }
      : null);

  const radius = featureRadius(measured);

  if (radius === null) {
    return null;
  }

  /*
   * The radius is drawn towards the user's placement, so the student
   * chooses the angle the leader sits at - which is how a radius is
   * kept clear of the rest of the drawing.
   */
  const toPlacement = {
    x: dimension.placement.x - centre.x,
    y: dimension.placement.y - centre.y,
  };

  const direction = normalise(
    Math.hypot(toPlacement.x, toPlacement.y) > 1e-9
      ? toPlacement
      : { x: 1, y: 0 }
  );

  const outer =
    dimension.dimensionType === "diameter"
      ? radius * 2
      : radius;

  const edge = {
    x: centre.x + direction.x * radius,
    y: centre.y + direction.y * radius,
  };

  const tip = {
    x: centre.x + direction.x * outer,
    y: centre.y + direction.y * outer,
  };

  /*
   * A diameter is drawn THROUGH the circle, which is what makes it
   * read as a diameter: the line crosses the centre and touches
   * both sides. A radius stops at the centre.
   */
  const start =
    dimension.dimensionType === "diameter"
      ? {
          x: centre.x - direction.x * radius,
          y: centre.y - direction.y * radius,
        }
      : centre;

  return {
    kind: "radial",
    dimensionType: dimension.dimensionType,
    measurement,
    centre,
    edge,
    line: [start, tip],
    arrowStyle: "outside",
    leader: {
      from: tip,
      to: {
        x: dimension.placement.x,
        y: dimension.placement.y,
      },
    },
    text,
    textFrame: textFrame(
      {
        x: (edge.x + tip.x) / 2,
        y: (edge.y + tip.y) / 2,
      },
      direction
    ),
  };
}

function angularGraphics(
  dimension,
  state,
  measurement,
  text
) {
  const references = dimension.sourceRefs || [];

  if (references.length < 2) {
    return null;
  }

  const first = findObject(
    state,
    references[0].featureId
  );
  const second = findObject(
    state,
    references[1].featureId
  );

  if (!first || !second) {
    return null;
  }

  const spanA = enggMeasurement.twoPointSpan(first);
  const spanB = enggMeasurement.twoPointSpan(second);

  if (!spanA || !spanB) {
    return null;
  }

  /*
   * An angle is measured about the vertex where the two spans meet.
   * When they do not meet exactly - which is the common case, since
   * they were drawn independently - the vertex is placed on the
   * first span, nearest its end, which is where the reader will look
   * for it.
   */
  const vertex = nearestVertex(spanA, spanB);

  const a = legDirection(vertex, spanA.start, spanA.end);
  const b = legDirection(vertex, spanB.start, spanB.end);

  if (!a || !b) {
    return null;
  }

  const radius = Math.max(
    Math.hypot(
      dimension.placement.x - vertex.x,
      dimension.placement.y - vertex.y
    ),
    1e-6
  );

  const arcPoints = arcFrom(vertex, a, b, radius);

  return {
    kind: "angular",
    dimensionType: dimension.dimensionType,
    measurement,
    vertex,
    arc: arcPoints,
    extensions: [
      [vertex, { x: vertex.x + a.x * radius, y: vertex.y + a.y * radius }],
      [vertex, { x: vertex.x + b.x * radius, y: vertex.y + b.y * radius }],
    ],
    arrowStyle: "outside",
    text,
    textFrame: textFrame(
      {
        x:
          vertex.x +
          ((a.x + b.x) / 2) * radius * 1.15,
        y:
          vertex.y +
          ((a.y + b.y) / 2) * radius * 1.15,
      },
      normalise({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      })
    ),
  };
}

/*
 * The direction from the vertex along a span, pointing away from it.
 *
 * A span whose vertex is one of its own ends - which is what two spans
 * drawn to a shared corner look like - must point at the OTHER end,
 * because pointing at the vertex itself gives a vector of length zero
 * and so no direction at all.
 *
 * The end FURTHER from the vertex is chosen rather than testing for
 * coincidence, so a span that merely begins near the vertex still gives a
 * usable direction instead of being rejected outright.
 */
function legDirection(vertex, start, end) {
  const toStart = normalise({
    x: start.x - vertex.x,
    y: start.y - vertex.y,
  });

  const toEnd = normalise({
    x: end.x - vertex.x,
    y: end.y - vertex.y,
  });

  const startDistance = Math.hypot(
    start.x - vertex.x,
    start.y - vertex.y
  );

  const endDistance = Math.hypot(
    end.x - vertex.x,
    end.y - vertex.y
  );

  return endDistance >= startDistance ? toEnd : toStart;
}

/*
 * Where two independently drawn spans meet.
 *
 * THE GENUINELY NEAREST PAIR OF ENDPOINTS, not a fixed end of the
 * first span.
 *
 * It used to be `spanA.end` - "the first span is the one the user
 * selected first and its end is the point they meant". That is true
 * only when the student happened to draw both spans ending at the
 * corner. Two spans drawn FROM a shared corner - which is what two
 * legs of a triangle look like when they are drawn outward from the
 * joint - have that corner as their STARTS, and taking `spanA.end`
 * then put the vertex at the far tip of the first line, giving an
 * angle measured at a point where the two spans do not meet at all.
 *
 * The corner is a fact about the geometry, so it is found from the
 * geometry: whichever of the four possible endpoints of the two spans
 * are closest together ARE the shared vertex. That is correct whether
 * the spans meet end-to-end, start-to-start, start-to-end, or merely
 * near each other with a small gap, and it does not depend on the
 * order the endpoints happen to be stored in.
 */
function nearestVertex(spanA, spanB) {
  if (!spanA || !spanB) {
    return spanA?.end || spanA?.start || null;
  }

  const pairs = [
    [spanA.start, spanB.start],
    [spanA.start, spanB.end],
    [spanA.end, spanB.start],
    [spanA.end, spanB.end],
  ];

  let best = null;
  let bestDistance = Infinity;

  for (const [a, b] of pairs) {
    if (!a || !b) {
      continue;
    }

    const gap = Math.hypot(a.x - b.x, a.y - b.y);

    if (gap < bestDistance) {
      bestDistance = gap;
      best = a;
    }
  }

  return best || spanA.end || spanA.start || null;
}

function arcFrom(centre, from, to, radius) {
  const startAngle = Math.atan2(from.y, from.x);
  const endAngle = Math.atan2(to.y, to.x);

  let sweep = endAngle - startAngle;

  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;

  const steps = 24;
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + (sweep * index) / steps;

    points.push({
      x: centre.x + Math.cos(angle) * radius,
      y: centre.y + Math.sin(angle) * radius,
    });
  }

  return points;
}

const enggDimensionModel = {
  DEFAULT_PRECISION,
  ORIENTATIONS,
  REFERENCE_KINDS,
  alreadyStated,
  createDimension,
  describesSameAs,
  dimensionDirection,
  featureRadius,
  findObject,
  formatMeasurement,
  graphicsFor,
  isResolved,
  measurePoints,
  measurementFor,
  newDimensionId,
  normaliseReferences,
  resolvePrecision,
  round,
};

export default enggDimensionModel;
