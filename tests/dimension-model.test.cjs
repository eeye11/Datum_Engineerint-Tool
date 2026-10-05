/*
 * The Dimension model, tested directly.
 *
 * A dimension's whole value is that it measures rather than remembers.
 * So most of what is checked here is that changing the GEOMETRY changes
 * the MEASUREMENT - which is the property that a stored-number
 * implementation would fail, and which no amount of rendering work
 * would recover.
 *
 * Pure module, so it is exercised in Node rather than through the
 * canvas.
 */
global.window = {
  crypto: {
    randomUUID: () => "test-uuid-0000"
  }
};

/* ---- the modules this one needs ---- */

require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");

global.window.enggDrawingState = {
  polygonVertices: (geometry) => {
    const centre = geometry?.center || { x: 0, y: 0 };
    const radius = Number(geometry?.radius) || 0;
    const sides = Number(geometry?.sides) || 6;

    return Array.from({ length: sides }, (_, index) => {
      const angle = (index * 2 * Math.PI) / sides;

      return {
        x: centre.x + radius * Math.cos(angle),
        y: centre.y + radius * Math.sin(angle)
      };
    });
  }
};

global.window.enggFeatureGeometry = {
  rectangleCorners: (geometry) => {
    const { position = { x: 0, y: 0 }, width = 0, height = 0 } =
      geometry || {};

    return [
      position,
      { x: position.x + width, y: position.y },
      { x: position.x + width, y: position.y + height },
      { x: position.x, y: position.y + height }
    ];
  }
};

require("../js/engineering-drawing/dimension-model.js");

const model = global.window.enggDimensionModel;

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(
      `  FAIL ${name}\n       expected ${JSON.stringify(expected)}` +
        `\n       actual   ${JSON.stringify(actual)}`
    );
  }
};

/* A document at 1 unit = 1 mm, so drawing units read as millimetres. */
const calibrated = () => ({ scale: { mmPerUnit: 1, unit: "mm" } });
const uncalibrated = () => ({});

const state = (...objects) => ({
  objects,
  scale: { mmPerUnit: 1, unit: "mm" }
});

const line = (id, start, end) => ({
  id,
  name: "Line",
  type: "line",
  geometry: { start, end },
  style: {},
  metadata: {}
});

console.log("\nA dimension stores references, not a value");
const beam = {
  id: "beam-1",
  name: "Beam",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    depth: 20
  },
  style: {},
  metadata: {}
};

const span = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "beam-1", anchor: "start" },
    { featureId: "beam-1", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});

check("it is a dimension object", span.type, "dimension");
check("with its own stable identity", typeof span.id === "string" && span.id.startsWith("dimension-"), true);
check("naming what it measures", span.dimensionType, "horizontal");
check(
  "referencing the feature rather than a number",
  span.sourceRefs,
  [
    { kind: "between", featureId: "beam-1", anchor: "start" },
    { kind: "between", featureId: "beam-1", anchor: "end" }
  ]
);
check(
  "and holding no measurement at all",
  "value" in span,
  false
);
check("its placement is its own", span.placement, { x: 50, y: 30 });

console.log("\nIt measures the geometry as it is now");
check("a 100 long beam reads 100", model.formatMeasurement(span, state(beam)), "100.00 mm");

console.log("\nMoving the geometry moves the measurement");
beam.geometry.end.x = 250;
check(
  "the same dimension now reads 250",
  model.formatMeasurement(span, state(beam)),
  "250.00 mm"
);

console.log("\nAnd that is because it was never a stored number");
const storedNumber = { ...span, value: 100 };
check(
  "a stored value would have been stale",
  storedNumber.value,
  100
);
check(
  "while the recomputed one follows",
  model.measurementFor(span, state(beam)).value,
  250
);

console.log("\nDeleting the source");
const orphaned = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "beam-1", anchor: "start" },
    { featureId: "beam-1", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});
check(
  "a dimension over a missing feature has no measurement",
  model.measurementFor(orphaned, state()),
  null
);
check(
  "and says so rather than showing a stale number",
  model.formatMeasurement(orphaned, state()),
  null
);
check(
  "and is reported unresolved",
  model.isResolved(orphaned, state()),
  false
);
check(
  "while a live one is resolved",
  model.isResolved(span, state(beam)),
  true
);

console.log("\nMeasurement types");
const circle = {
  id: "c1",
  type: "circle",
  geometry: { center: { x: 0, y: 0 }, radius: 25 },
  style: {},
  metadata: {}
};
const diameter = model.createDimension({
  dimensionType: "diameter",
  refs: [{ featureId: "c1", anchor: "east" }],
  placement: { x: 25, y: 25 }
});
check(
  "a circle's diameter is its real diameter",
  model.formatMeasurement(diameter, state(circle)),
  "Ø50.00 mm"
);
check(
  "and follows the circle when the circle changes",
  (() => {
    circle.geometry.radius = 40;
    return model.formatMeasurement(diameter, state(circle));
  })(),
  "Ø80.00 mm"
);

const radius = model.createDimension({
  dimensionType: "radius",
  refs: [{ featureId: "c1", anchor: "east" }],
  placement: { x: 40, y: 40 }
});
check(
  "and its radius is half of that",
  model.formatMeasurement(radius, state(circle)),
  "R40.00 mm"
);

const arc = {
  id: "a1",
  type: "arc",
  geometry: {
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: Math.PI / 2
  },
  style: {},
  metadata: {}
};
const arcLength = model.createDimension({
  dimensionType: "arc-length",
  refs: [{ featureId: "a1", anchor: "center" }],
  placement: { x: 10, y: 10 }
});
check(
  "an arc's length follows its sweep",
  Math.round(model.measurementFor(arcLength, state(arc)).value * 100) / 100,
  15.71
);

console.log("\nA shaft's diameter is a diameter, not a centreline");
const shaft = {
  id: "s1",
  type: "shaft",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 200, y: 0 },
    diameter: 40
  },
  style: {},
  metadata: {}
};
const shaftDiameter = model.createDimension({
  dimensionType: "diameter",
  refs: [{ kind: "property", featureId: "s1", property: "diameter" }],
  placement: { x: 0, y: 20 }
});
check(
  "a 40 diameter shaft measures 40, not its 200 span",
  model.formatMeasurement(shaftDiameter, state(shaft)),
  "Ø40.00 mm"
);
check(
  "and its radius is half, not the span",
  model.featureRadius(shaft),
  20
);

console.log("\nAngles");
const legA = line("l1", { x: 0, y: 0 }, { x: 100, y: 0 });
const legB = line("l2", { x: 0, y: 0 }, { x: 0, y: 100 });
const angle = model.createDimension({
  dimensionType: "angular",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l2", anchor: "start" }
  ],
  placement: { x: 40, y: 40 }
});
const angleText = model.formatMeasurement(
  angle,
  state(legA, legB)
);
/*
 * At the document's precision, like every other measurement. An
 * angle is dimensionless - no unit is appended and the degree sign
 * appears instead - but it is not exempt from how the document shows
 * its numbers, and "90°" beside "100.00 mm" on one drawing would be
 * the inconsistency this system exists to avoid.
 */
check("a right angle reads 90", angleText, "90.00°");
check("with no unit on it", angleText.includes("mm"), false);
check(
  "and an angle carries no prefix",
  model.measurementFor(angle, state(legA, legB)).angular,
  true
);

console.log("\nPrecision");
check(
  "defaults to two places",
  model.round(4.5678, 2),
  4.57
);
check(
  "and never shows a floating point artefact",
  model.round(0.1 + 0.2, 2),
  0.3
);
check(
  "even at the boundary",
  model.round(4.999999, 2),
  5
);
check(
  "or a negative zero",
  Object.is(model.round(-0.001, 2), -0),
  false
);
check(
  "and honours the document's precision",
  model.resolvePrecision(
    { style: { precision: null } },
    { dimensionPrecision: 3 }
  ),
  3
);
check(
  "which the dimension can override",
  model.resolvePrecision(
    { style: { precision: 0 } },
    { dimensionPrecision: 3 }
  ),
  0
);

console.log("\nUnits");
const metres = {
  objects: [line("l1", { x: 0, y: 0 }, { x: 1500, y: 0 })],
  scale: { mmPerUnit: 1, unit: "m" }
};
const metreDimension = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l1", anchor: "end" }
  ],
  placement: { x: 750, y: 40 }
});
check(
  "a dimension reads in the document's units",
  model.formatMeasurement(metreDimension, metres),
  "1.50 m"
);

console.log("\nZoom never changes a measurement");
const zoomed = { ...metres, camera: { zoom: 2, panX: 0, panY: 0 } };
check(
  "the same drawing at 200% reads the same",
  model.formatMeasurement(metreDimension, zoomed),
  model.formatMeasurement(metreDimension, metres)
);
check(
  "and at 400%",
  model.formatMeasurement(metreDimension, {
    ...metres,
    camera: { zoom: 4 }
  }),
  "1.50 m"
);

console.log("\nCalibration");
const provisional = {
  objects: [line("l1", { x: 0, y: 0 }, { x: 100, y: 0 })],
  scale: null
};
const provisionalDimension = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l1", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});
check(
  "an uncalibrated drawing still measures",
  model.measurementFor(provisionalDimension, provisional).value,
  100
);
/*
 * NO TILDE.
 *
 * This used to read "~100.00 mm". The tilde marked an uncalibrated
 * measurement as approximate, which reads as careful engineering caution and
 * is in fact the opposite of what happens: the document has NOT been told
 * what a unit is worth and is currently assuming one drawing unit is one
 * millimetre, and no quantity printed on the sheet can fix that.
 *
 * A dimension that ESTABLISHED the scale is the least approximate thing on
 * the drawing, and marking it uncertain argued against the very feature that
 * produced it. So the mark is gone from both states, and the uncalibrated
 * case is surfaced once - in the prompt where the student is asked what the
 * geometry really measures, and where they can act on the answer - rather
 * than repeated on every dimension where they cannot.
 */
check(
  "and states the value plainly, with no approximation mark",
  model.formatMeasurement(provisionalDimension, provisional),
  "100.00 mm"
);

check(
  "and never carries a tilde",
  String(
    model.formatMeasurement(provisionalDimension, provisional)
  ).includes("~"),
  false,
);

const calibratedState = {
  ...provisional,
  scale: { mmPerUnit: 1.25, unit: "mm" }
};

check(
  "and a calibrated dimension carries no tilde either",
  model.formatMeasurement(provisionalDimension, calibratedState),
  "125.00 mm"
);
check(
  "and calibrating changes it for good",
  model.formatMeasurement(provisionalDimension, calibratedState),
  "125.00 mm"
);

console.log("\nRedundancy");
const existing = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l1", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});
const sameAgain = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l1", anchor: "end" }
  ],
  placement: { x: 50, y: -30 }
});
const different = model.createDimension({
  dimensionType: "vertical",
  refs: [
    { featureId: "l1", anchor: "start" },
    { featureId: "l1", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});
check(
  "the same measurement is recognised wherever it is drawn",
  model.describesSameAs(existing, sameAgain),
  true
);
check(
  "a different type is not",
  model.describesSameAs(existing, different),
  false
);
check(
  "and the document knows it is already stated",
  model.alreadyStated(sameAgain, {
    objects: [existing]
  }),
  true
);
check(
  "but not for a measurement it does not have",
  model.alreadyStated(different, {
    objects: [existing]
  }),
  false
);

console.log("\nGraphics");
/*
 * Its own beam, not the shared one. The earlier tests deliberately
 * moved `beam` to prove that a dimension follows its geometry, so reusing it
 * here would measure a stale object while the dimension referenced
 * the current one - and would report a null that had nothing to do
 * with the graphics being tested.
 */
const graphicsBeam = {
  id: "beam-graphics",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    depth: 20
  },
  style: {},
  metadata: {}
};

const graphicsDimension = model.createDimension({
  dimensionType: "horizontal",
  refs: [
    { featureId: "beam-graphics", anchor: "start" },
    { featureId: "beam-graphics", anchor: "end" }
  ],
  placement: { x: 50, y: 30 }
});

const graphics = model.graphicsFor(
  graphicsDimension,
  state(graphicsBeam)
);
check("a linear dimension draws a dimension line", Array.isArray(graphics.line), true);
check("with extension lines to the measured points", graphics.extensions.length, 2);
check("and its text", graphics.text, "100.00 mm");
check(
  "set so it reads upright",
  Math.abs(graphics.textFrame.angle) < 90,
  true
);
check(
  "standing off the beam where it was placed",
  Math.round(graphics.line[0].y),
  30
);
/*
 * Its own circle, with its own radius dimension. The shared one was
 * left with a radius of 40 by the checks above, and the diameter
 * dimension that pointed at it referenced an anchor name a circle
 * does not have - so this was measuring the leftovers of other tests
 * rather than what it claims to measure.
 */
const diameterBeamCircle = {
  id: "c-graphics",
  type: "circle",
  geometry: { center: { x: 0, y: 0 }, radius: 25 },
  style: {},
  metadata: {}
};

const diameterGraphicsDimension = model.createDimension({
  dimensionType: "diameter",
  refs: [{ featureId: "c-graphics", anchor: "east" }],
  placement: { x: 25, y: 25 }
});

const diameterGraphics = model.graphicsFor(
  diameterGraphicsDimension,
  state(diameterBeamCircle)
);
check(
  "a diameter is drawn through its circle",
  Math.sign(diameterGraphics.line[0].x),
  -Math.sign(diameterGraphics.line[1].x)
);

console.log("\nA point to a line is the PERPENDICULAR distance");
/*
 * The foot of the perpendicular, which is the number an engineering drawing
 * means by "distance from a point to a line". The point sits directly above the
 * line's middle, so the perpendicular distance is its height - 40 - while the
 * straight distance to the line's START is the hypotenuse, sqrt(50^2 + 40^2),
 * which is a different and larger number.
 *
 * Measuring the start anchor is exactly the fault this guards against: the
 * dimension would have looked right and stated the distance to the end of the
 * line rather than the distance to the line.
 */
const pointFeature = {
  id: "p-line",
  type: "point",
  geometry: { position: { x: 50, y: 40 } },
  style: {},
  metadata: {}
};
const baseLine = {
  id: "l-base",
  type: "line",
  geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  style: {},
  metadata: {}
};
const pointLine = model.createDimension({
  dimensionType: "point-line",
  refs: [
    { featureId: "p-line", anchor: "position" },
    { featureId: "l-base", anchor: "start" },
    { featureId: "l-base", anchor: "end" }
  ],
  placement: { x: 50, y: 60 }
});
check(
  "a point 40 above a line is 40 from it, not the hypotenuse to its end",
  Math.round(model.measurementFor(pointLine, state(pointFeature, baseLine)).value),
  40
);
check(
  "and it reads as a plain length in the document's units",
  model.formatMeasurement(pointLine, state(pointFeature, baseLine)),
  "40.00 mm"
);
/*
 * The perpendicular is recomputed from the line's CURRENT geometry, so a line
 * that rotates changes the distance - which is what makes the reference
 * associative rather than a frozen number.
 */
const rotatedLine = {
  ...baseLine,
  geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 100 } }
};
check(
  "and follows the line when it rotates",
  Math.round(model.measurementFor(pointLine, state(pointFeature, rotatedLine)).value),
  50
);
check(
  "the drawn line runs along the perpendicular",
  (() => {
    const g = model.graphicsFor(pointLine, state(pointFeature, baseLine));
    const [from, to] = g.line;
    /* The point is above the line, so the dimension runs vertically. */
    return Math.abs(to.x - from.x) < 1e-9 && Math.abs(to.y - from.y) > 1;
  })(),
  true
);
check(
  "and no approximation mark appears anywhere on it",
  String(model.formatMeasurement(pointLine, state(pointFeature, baseLine))).includes("~"),
  false
);

console.log("\nA diameter and a radius are set against their symbol");
/*
 * "Ø50 mm" and "R25 mm", not "Ø 50 mm". The symbol qualifies the number and is
 * set hard against it, which is the engineering convention and the thing that
 * makes the two read as a diameter and a radius rather than as a stray letter.
 */
const symbolCircle = {
  id: "c-symbol",
  type: "circle",
  geometry: { center: { x: 0, y: 0 }, radius: 25 },
  style: {},
  metadata: {}
};
const symbolDiameter = model.createDimension({
  dimensionType: "diameter",
  refs: [{ featureId: "c-symbol", anchor: "east" }],
  placement: { x: 25, y: 25 }
});
const symbolRadius = model.createDimension({
  dimensionType: "radius",
  refs: [{ featureId: "c-symbol", anchor: "east" }],
  placement: { x: 25, y: 25 }
});
check(
  "a diameter reads Ø50.00 mm",
  model.formatMeasurement(symbolDiameter, state(symbolCircle)),
  "Ø50.00 mm"
);
check(
  "a radius reads R25.00 mm",
  model.formatMeasurement(symbolRadius, state(symbolCircle)),
  "R25.00 mm"
);
check(
  "with no space between symbol and number",
  model.formatMeasurement(symbolDiameter, state(symbolCircle)).startsWith("Ø5"),
  true
);

console.log("\nA dimension cannot state a number");
check(
  "there is no way to set one",
  typeof model.createDimension({ value: 50 }),
  "object"
);
check(
  "and what comes back has none",
  "value" in model.createDimension({ value: 50 }),
  false
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
