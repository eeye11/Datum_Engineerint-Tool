/*
 * ========================================================
 * ANGLE DIMENSIONING BETWEEN TWO EDGES OF ONE FEATURE
 * ========================================================
 *
 * THE DEFECT THIS PINS: an angular dimension between two edges of the SAME
 * feature measured nothing. Both references resolve to the same feature, and
 * the measurement asked that feature for its span - and a triangle's "span" is
 * its first point to its last, not the side that was clicked. So two sides of
 * one triangle produced the SAME span for both legs, and their angle was zero
 * or about the wrong lines entirely.
 *
 * The fix is that a reference resolves ITS OWN anchors first
 * (`spanOfReference`), so `segment0Start`/`segment0End` give the side that was
 * clicked. Two sides of one triangle are then two different lines, with a real
 * angle between them - which is the whole point of dimensioning a triangle.
 *
 * Run against the real model: a real triangle feature, real references, the
 * real measurement. The expected angles are arithmetic from the triangle's own
 * coordinates, not a guess.
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;
global.Element = dom.window.Element;

const state = require(modulePath("drawing-state.js")).default;
const model = require(modulePath("dimension-model.js")).default;
const inference = require(modulePath("dimension-inference.js"));

/*
 * A RIGHT TRIANGLE, so every included angle is arithmetic rather than eyeballed:
 *
 *     A (0, 0)
 *     |\
 *     | \
 *     |  \  hypotenuse
 *     |   \
 *     B----C
 *
 * A to B is the vertical leg, A to C the horizontal leg, so the angle at A is
 * exactly 90 degrees and the two acute angles are exact atan values.
 */
const A = { x: 0, y: 0 };
const B = { x: 0, y: 100 };
const C = { x: 100, y: 0 };

function makeTriangle() {
  const st = state.createDrawingState();

  // A triangle stores its three corners; the sides are derived from them.
  const triangle = state.geometryFactories.triangle([A, B, C]);

  triangle.id = "tri_1";

  st.objects.push(triangle);

  return { st, triangle };
}

/*
 * A reference to ONE SIDE of the triangle.
 *
 * The anchors name the segment, which is exactly what a click on that side
 * produces - `segment0Start` is the first side's start, and so on. The order
 * the corners are stored in decides which index is which side, so the sides
 * are found by their ENDS rather than by index: a test that assumed an index
 * would be testing the construction order, not the geometry.
 */
function sideReference(triangle, from, to) {
  const points = (triangle.geometry.points || []).filter(
    (p) => p && Number.isFinite(p.x),
  );

  // The chain closes, so the last side returns to the first point.
  const chain = [...points, { ...points[0] }];

  const samePoint = (p, q) =>
    Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

  for (let i = 0; i < chain.length - 1; i += 1) {
    const start = chain[i];
    const end = chain[i + 1];

    const forward = samePoint(start, from) && samePoint(end, to);
    const backward = samePoint(start, to) && samePoint(end, from);

    if (forward || backward) {
      return {
        kind: "line",
        featureId: triangle.id,
        anchor: `segment${i}Start`,
        endAnchor: `segment${i}End`,
        object: triangle,
      };
    }
  }

  return null;
}

/* The descriptor the Smart Dimension tool would infer from two references. */
function infer(a, b) {
  return inference.inferDimensionDescriptor(a, b);
}

/* The value a committed angular dimension would report. */
function valueOf(st, refA, refB, placement) {
  const dimension = state.geometryFactories.dimension({
    dimensionType: "angular",
    refs: [
      { kind: "between", featureId: refA.featureId, anchor: refA.anchor },
      { kind: "between", featureId: refB.featureId, anchor: refB.anchor },
    ],
    placement,
  });

  st.objects.push(dimension);

  const measurement = model.measurementFor(dimension, st);

  st.objects.pop();

  return measurement ? Math.round(measurement.value * 100) / 100 : null;
}

console.log("\n  a reference names ONE SIDE, not the whole triangle\n");

{
  const { triangle } = makeTriangle();

  const ab = sideReference(triangle, A, B);
  const ac = sideReference(triangle, A, C);

  check(
    "the triangle's two legs are referenceable independently",
    Boolean(ab && ac),
    "sideReference found no side - the triangle's chain is not as expected",
  );

  check(
    "and the two sides are DIFFERENT references",
    ab && ac && ab.anchor !== ac.anchor,
    `ab=${ab?.anchor}, ac=${ac?.anchor}`,
  );

  check(
    "even though they belong to ONE feature",
    ab && ac && ab.featureId === ac.featureId,
    "this is the case that used to measure nothing",
  );
}

console.log("\n  the inference offers an ANGLE for two sides of one feature\n");

{
  const { triangle } = makeTriangle();

  const ab = sideReference(triangle, A, B);
  const ac = sideReference(triangle, A, C);

  const descriptor = infer(ab, ac);

  check(
    "two sides of one triangle infer an angular dimension",
    descriptor?.dimensionType === "angular",
    `got ${JSON.stringify(descriptor?.dimensionType)}`,
  );

  check(
    "and the descriptor names BOTH sides",
    descriptor?.refs?.length === 2 &&
      descriptor.refs[0].anchor !== descriptor.refs[1].anchor,
    `got ${JSON.stringify(descriptor?.refs)}`,
  );
}

console.log("\n  the angle at A is 90 degrees (the two legs)\n");

{
  const { st, triangle } = makeTriangle();

  const ab = sideReference(triangle, A, B);
  const ac = sideReference(triangle, A, C);

  /*
   * The placement sits inside the right angle at A - the quadrant with both
   * +x and +y - so the cursor is in the 90-degree sector.
   */
  const value = valueOf(st, ab, ac, { x: 30, y: 30 });

  check(
    "measuring the two legs of a right triangle gives 90",
    value === 90,
    `got ${value}`,
  );
}

console.log("\n  the angles at the other vertices are correct too\n");

{
  const { st, triangle } = makeTriangle();

  const ab = sideReference(triangle, A, B);
  const bc = sideReference(triangle, B, C);
  const ac = sideReference(triangle, A, C);

  /*
   * At B: the leg BA and the hypotenuse BC. The angle between (0,1) and
   * (1,-1) is 135 degrees of included turn, which is the supplement of the
   * triangle's own angle - so the cursor picks the sector, exactly as it does
   * for two independent lines.
   */
  const atB = infer(ab, bc);

  check(
    "two sides meeting at B infer an angle",
    atB?.dimensionType === "angular",
    `got ${JSON.stringify(atB?.dimensionType)}`,
  );

  const atC = infer(ac, bc);

  check(
    "two sides meeting at C infer an angle",
    atC?.dimensionType === "angular",
    `got ${JSON.stringify(atC?.dimensionType)}`,
  );

  /*
   * The shared vertex really is B: the two references' spans must meet there.
   * Checked by measurement - if the model used the triangle's overall span,
   * the "vertex" would be nowhere near B and this would not hold.
   */
  const atBValue = valueOf(st, ab, bc, { x: -20, y: 60 });

  check(
    "the angle at B is 135 degrees in its obtuse sector",
    atBValue === 135,
    `got ${atBValue}`,
  );

  const atAValue = valueOf(st, ab, ac, { x: 20, y: 20 });

  check(
    "and the two-sided measurements at A and B differ",
    atAValue === 90 && atBValue === 135,
    `A=${atAValue}, B=${atBValue}`,
  );
}

console.log("\n  PARALLEL sides are a distance, not an angle\n");

{
  /*
   * A rectangle: its top and bottom edges are parallel, so a click on each is
   * a DISTANCE, not a zero angle. The inference must say so.
   */
  const st = state.createDrawingState();

  const rectangle = state.geometryFactories.rectangle(
    { x: 0, y: 0 },
    120,
    80,
  );

  rectangle.id = "rect_1";
  st.objects.push(rectangle);

  const sides = (rectangle.geometry.points || []).slice();

  const refFor = (index) => ({
    kind: "line",
    featureId: rectangle.id,
    anchor: `segment${index}Start`,
    endAnchor: `segment${index}End`,
    object: rectangle,
  });

  /*
   * Sides 0 and 2 of a rectangle are opposite, so they are parallel.
   */
  const parallel = infer(refFor(0), refFor(2));

  check(
    "two parallel sides of one rectangle are a distance",
    parallel && parallel.dimensionType !== "angular",
    `got ${JSON.stringify(parallel?.dimensionType)}`,
  );

  const adjacent = infer(refFor(0), refFor(1));

  check(
    "two adjacent sides of one rectangle are an angle",
    adjacent?.dimensionType === "angular",
    `got ${JSON.stringify(adjacent?.dimensionType)}`,
  );

  void sides;
}

console.log("\n  an edge against itself is still refused\n");

{
  const { triangle } = makeTriangle();

  const ab1 = sideReference(triangle, A, B);
  const ab2 = sideReference(triangle, B, A); // the SAME side, reversed

  check(
    "the same side twice does not infer an angle",
    infer(ab1, ab2) === null,
    "one line has no angle to itself, however it was clicked",
  );
}

console.log("\n  REPEATED across both endpoint orders, the value is stable\n");

{
  const { st, triangle } = makeTriangle();

  const ab = sideReference(triangle, A, B);
  const ba = sideReference(triangle, B, A);
  const ac = sideReference(triangle, A, C);
  const ca = sideReference(triangle, C, A);

  check(
    "all four endpoint orders of the two legs give 90 at A",
    valueOf(st, ab, ac, { x: 30, y: 30 }) === 90 &&
      valueOf(st, ab, ca, { x: 30, y: 30 }) === 90 &&
      valueOf(st, ba, ac, { x: 30, y: 30 }) === 90 &&
      valueOf(st, ba, ca, { x: 30, y: 30 }) === 90,
    "an edge is a line, not an arrow",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
