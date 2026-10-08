/*
 * ========================================================
 * AN ANGLE BETWEEN TWO EDGES OF ONE FEATURE
 * ========================================================
 *
 * The requirement that the whole angular workflow turns on: a TRIANGLE is one
 * feature with three EDGES, and any two of its edges must be valid references
 * for an angle. "Two lines" does not mean "two features".
 *
 * The defect this pins: `measureAngle` and `angularGraphics` resolved each
 * reference through the FEATURE's own span - `twoPointSpan(triangle)`, which
 * describes the triangle as a whole - so both sides of one triangle resolved to
 * the SAME span, and their "angle" was zero or a number about the wrong lines.
 *
 * The fix is `spanOfReference`: a reference's own `anchor`/`endAnchor` are
 * resolved first, so the measurement uses the edge the student actually
 * clicked. This test builds a real triangle, makes references to two of its
 * edges exactly as the click pipeline does, and checks the angle at each
 * vertex.
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
const measure = require(modulePath("measurement-core.js")).default;
const model = require(modulePath("dimension-model.js")).default;

/*
 * A RIGHT TRIANGLE with a known 3-4-5 shape, so every expected angle is
 * arithmetic rather than a number copied from a previous run:
 *
 *     A (0, 0)
 *     |\
 *     | \
 *     |  \
 *     C---B
 *
 * With A at the right angle: the angle at A is 90, at B is ~53.13, at C ~36.87.
 *
 * The points are chosen so the triangle's own span (first point to last) is NOT
 * either of the sides involved - which is what made the old code measure the
 * wrong thing.
 */
const A = { x: 0, y: 0 };
const B = { x: 40, y: 0 };
const C = { x: 0, y: 30 };

const st = state.createDrawingState();

const triangle = state.geometryFactories.triangle([A, B, C]);

state.addObject(st, triangle);

/*
 * The reference a CLICK on an edge produces. The anchor names are exactly the
 * ones `compositeSegmentReference` returns and `resolveAnchor` understands, so
 * this is the real reference shape, not an approximation of it.
 *
 * Segment order follows the closed chain A -> B -> C -> A:
 *   segment0 = A to B
 *   segment1 = B to C
 *   segment2 = C to A
 */
const edgeRef = (index) => ({
  kind: "line",
  featureId: triangle.id,
  anchor: `segment${index}Start`,
  endAnchor: `segment${index}End`,
  object: triangle,
});

/*
 * WHERE THE CURSOR SITS DECIDES WHICH OF THE FOUR SECTORS IS DIMENSIONED, so
 * each case places the dimension at a point that is unambiguously inside the
 * angle being asked about - a little way from the vertex, toward the middle of
 * the triangle. Without that the cursor picks the SUPPLEMENT, which is
 * correct behaviour and the wrong number for this test.
 */
const inward = (vertex, toward, distance = 12) => {
  const dx = toward.x - vertex.x;
  const dy = toward.y - vertex.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: vertex.x + (dx / length) * distance,
    y: vertex.y + (dy / length) * distance,
  };
};

const centroid = {
  x: (A.x + B.x + C.x) / 3,
  y: (A.y + B.y + C.y) / 3,
};

const angleBetween = (firstIndex, secondIndex, vertex) => {
  const dimension = state.geometryFactories.dimension({
    dimensionType: "angular",
    refs: [edgeRef(firstIndex), edgeRef(secondIndex)],
    placement: inward(vertex, centroid),
  });

  st.objects.push(dimension);

  const measurement = model.measurementFor(dimension, st);

  st.objects.pop();

  return measurement ? Math.round(measurement.value * 100) / 100 : null;
};

/* The edge indices, named so the test reads as the geometry it is about. */
const AB = 0;
const BC = 1;
const CA = 2;

console.log("\n  two EDGES of one triangle are valid angular references\n");

check(
  "the triangle is ONE feature, as the model stores it",
  st.objects.filter((o) => o.type === "triangle").length === 1,
);

console.log("\n  the angle at each vertex, from the two edges that meet there\n");

check(
  "angle at A, from AB + CA, is 90 degrees",
  angleBetween(AB, CA, A) === 90,
  `got ${angleBetween(AB, CA, A)}`,
);

check(
  "angle at B, from AB + BC, is 36.87 degrees",
  angleBetween(AB, BC, B) === 36.87,
  `got ${angleBetween(AB, BC, B)}`,
);

check(
  "angle at C, from BC + CA, is 53.13 degrees",
  angleBetween(BC, CA, C) === 53.13,
  `got ${angleBetween(BC, CA, C)}`,
);

console.log("\n  EVERY vertex works, not just the first\n");

check(
  "all three vertex angles are distinct and non-zero",
  new Set([
    angleBetween(AB, CA, A),
    angleBetween(AB, BC, B),
    angleBetween(BC, CA, C),
  ]).size === 3,
  "a wrong vertex would repeat an angle or give zero",
);

check(
  "and the three angles of a triangle sum to 180",
  (() => {
    const sum =
      angleBetween(AB, CA, A) +
      angleBetween(AB, BC, B) +
      angleBetween(BC, CA, C);

    return Math.abs(sum - 180) < 0.02;
  })(),
  `sum was ${
    angleBetween(AB, CA, A) +
    angleBetween(AB, BC, B) +
    angleBetween(BC, CA, C)
  }`,
);

console.log("\n  the value is the EDGE angle, not the whole-feature span\n");

check(
  "a side measured on its own is the side's length, not the triangle's extent",
  (() => {
    /*
     * A LENGTH dimension on one edge: its two ends are that edge's two ends.
     * AB is 40 long; the triangle's own first-to-last span (A to C) is 30, so
     * a wrong resolution through the feature would give 30.
     */
    const dimension = state.geometryFactories.dimension({
      dimensionType: "aligned",
      refs: [
        {
          kind: "between",
          featureId: triangle.id,
          anchor: "segment0Start",
        },
        {
          kind: "between",
          featureId: triangle.id,
          anchor: "segment0End",
        },
      ],
      placement: { x: 20, y: 10 },
    });

    st.objects.push(dimension);
    const m = model.measurementFor(dimension, st);
    st.objects.pop();

    return m && Math.abs(m.value - 40) < 0.01;
  })(),
  "resolving through the feature span would give 30, not 40",
);

console.log("\n  reversing an edge's endpoints changes nothing\n");

check(
  "an edge stored end-to-start gives the same angle",
  (() => {
    /*
     * Build a fresh triangle with its second vertex's edges stored the other
     * way round, and check the angle at A is unchanged. The physical shape is
     * identical, so the measured relationship must be too.
     */
    const st2 = state.createDrawingState();

    const t2 = state.geometryFactories.triangle([A, B, C]);

    state.addObject(st2, t2);

    const reversedFirst = {
      kind: "line",
      featureId: t2.id,
      // CA reversed: the edge from A to C becomes C to A.
      anchor: "segment2End",
      endAnchor: "segment2Start",
      object: t2,
    };

    const second = {
      kind: "line",
      featureId: t2.id,
      anchor: "segment0Start",
      endAnchor: "segment0End",
      object: t2,
    };

    const dimension = state.geometryFactories.dimension({
      dimensionType: "angular",
      refs: [reversedFirst, second],
      placement: inward(A, centroid),
    });

    st2.objects.push(dimension);
    const m = model.measurementFor(dimension, st2);
    st2.objects.pop();

    return m && Math.round(m.value * 100) / 100 === 90;
  })(),
  "a line has an axis, not an arrow",
);

console.log("\n  parallel edges of ONE feature are a DISTANCE, not an angle\n");

check(
  "the inference offers a distance - not an angle - for parallel edges",
  (() => {
    /*
     * A rectangle's top and bottom edges are parallel. The INFERENCE is the
     * thing that decides which measurement two references imply, so this is
     * where "parallel means a distance" has to hold: it must not offer an
     * angle of zero, which would be a claim that the two edges are one line.
     */
    const st3 = state.createDrawingState();

    const rect = state.geometryFactories.rectangle(A, 80, 40);

    state.addObject(st3, rect);

    const inference = require(modulePath("dimension-inference.js"));

    const top = {
      kind: "line",
      featureId: rect.id,
      anchor: "segment0Start",
      endAnchor: "segment0End",
      object: rect,
    };

    const bottom = {
      kind: "line",
      featureId: rect.id,
      anchor: "segment2Start",
      endAnchor: "segment2End",
      object: rect,
    };

    const descriptor = inference.inferDimensionDescriptor(top, bottom);

    return (
      descriptor &&
      descriptor.dimensionType !== "angular" &&
      descriptor.refs.length >= 2
    );
  })(),
  "an angular descriptor here would draw a zero-degree arc",
);

void measure;

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
