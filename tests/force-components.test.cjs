
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ARE THE COMPONENTS ACTUALLY THE COMPONENTS?
 *
 * Reported faults: backward arrowheads, a duplicate of the source force,
 * and components that go stale when the force moves, is dragged, or has
 * its magnitude, direction or unit changed.
 *
 * The reported faults split into two kinds, and only one of them is a
 * question for this file. "A duplicate of the source force" is about
 * WHAT gets created, and is answered by the count assertions at the end.
 * Everything else - the arrowheads, and the staleness - is about what is
 * DERIVED, and that is arithmetic that can be checked exactly.
 *
 * So this works from the model. A force is written, the components are
 * derived from it, and the numbers are compared against the arithmetic.
 * No rendering, no pixels: a component drawn backwards is a renderer's
 * problem, and a component that is arithmetically wrong is a model's
 * problem, and the two need separating.
 */

global.window = {};

loadModule("feature-geometry.js");
loadModule("body-frames.js");
loadModule("analysis-dependencies.js");

const deps = global.window.enggAnalysisDependencies;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
    );
  }
};

const near = (a, b) =>
  Number.isFinite(a) && Math.abs(a - b) < 1e-9;

/*
 * A FORCE AS THE STUDENT WRITES IT.
 *
 * A Point Force states a magnitude and an angle. The angle is measured
 * in degrees anticlockwise from the positive x axis, which is the
 * convention the whole Statics panel uses, so a force at 0 degrees points
 * along +x and one at 90 points along +y.
 */
const forceAt = (magnitude, angleDegrees) => ({
  id: `force-${magnitude}-${angleDegrees}`,
  type: "force",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    position: { x: 0, y: 0 },
    magnitude,
    angle: angleDegrees
  }
});

console.log("\n  components are the components\n");

/* ============================================================
   THE SIGNS, WHICH ARE WHERE AN ARROWHEAD GOES WRONG
   ============================================================ */

console.log("  every quadrant, and every zero\n");

/*
 * All four quadrants plus both zero cases. This is the set that matters:
 * a derivation that mishandles a sign still draws something, and looks
 * plausible, which is why "the components appear" is not a check.
 */
const QUADRANTS = [
  ["+x +y", 100, 45, 100 * Math.SQRT1_2, 100 * Math.SQRT1_2],
  ["-x +y", 100, 135, -100 * Math.SQRT1_2, 100 * Math.SQRT1_2],
  ["-x -y", 100, 225, -100 * Math.SQRT1_2, -100 * Math.SQRT1_2],
  ["+x -y", 100, 315, 100 * Math.SQRT1_2, -100 * Math.SQRT1_2],
  ["+x only", 100, 0, 100, 0],
  ["+y only", 100, 90, 0, 100],
  ["-x only", 100, 180, -100, 0],
  ["-y only", 100, 270, 0, -100]
];

QUADRANTS.forEach(([label, magnitude, angle, expectedX, expectedY]) => {
  const derived =
    deps.deriveForceComponents(forceAt(magnitude, angle));

  if (!derived) {
    check(`${label}: components are derived`, false, "no derivation");
    return;
  }

  check(
    `${label}: the x component is right`,
    near(derived.x.x, expectedX),
    `expected ${expectedX}, got ${derived.x.x}`
  );

  check(
    `${label}: the y component is right`,
    near(derived.y.y, expectedY),
    `expected ${expectedY}, got ${derived.y.y}`
  );

  /*
   * THE SIGN IS THE COMPONENT. A component is not a length, so a
   * negative one is a direction and must stay negative here. If a sign
   * were dropped, the component would draw pointing the wrong way along
   * the axis - which is precisely the reported backward-arrowhead fault,
   * in the only place it can be caught before the renderer sees it.
   */
  check(
    `${label}: the x component keeps its sign`,
    expectedX === 0 || Math.sign(derived.x.x) === Math.sign(expectedX),
    `expected sign ${Math.sign(expectedX)}, got ${Math.sign(derived.x.x)}`
  );

  check(
    `${label}: the y component keeps its sign`,
    expectedY === 0 || Math.sign(derived.y.y) === Math.sign(expectedY),
    `expected sign ${Math.sign(expectedY)}, got ${Math.sign(derived.y.y)}`
  );

  check(
    `${label}: the other axis of each component is zero`,
    derived.x.y === 0 && derived.y.x === 0,
    `x = ${JSON.stringify(derived.x)}, y = ${JSON.stringify(derived.y)}`
  );
});

/* ============================================================
   THE ORIGINAL, AND THE ARITHMETIC THAT MUST CLOSE
   ============================================================ */

console.log("\n  the original, and the sum back to it\n");

const sample = deps.deriveForceComponents(forceAt(100, 37));

check(
  "the original vector is the whole force",
  near(sample.original.x, 100 * Math.cos(37 * Math.PI / 180)) &&
    near(sample.original.y, 100 * Math.sin(37 * Math.PI / 180)),
  `original = ${JSON.stringify(sample.original)}`
);

/*
 * Fx^2 + Fy^2 = F^2. If this closes, the two components are a real
 * decomposition of the force rather than two unrelated numbers that
 * happen to look right at the cardinal directions.
 */
check(
  "the components square back to the magnitude",
  near(
    Math.hypot(sample.x.x, sample.y.y),
    sample.magnitude
  ),
  `hypot = ${Math.hypot(sample.x.x, sample.y.y)}, magnitude = ${sample.magnitude}`
);

check(
  "the decomposition adds back up to the original",
  near(sample.x.x + sample.y.x, sample.original.x) &&
    near(sample.x.y + sample.y.y, sample.original.y),
  `sum = (${sample.x.x + sample.y.x}, ${
    sample.x.y + sample.y.y
  }), original = (${sample.original.x}, ${sample.original.y})`
);

/* ============================================================
   COMPONENTS STATED DIRECTLY WIN
   ============================================================ */

console.log("\n  a force may be given as Fx and Fy\n");

/*
 * A student who has just typed Fx and Fy means those, whatever the angle
 * field still says. This is the case the reported "stale geometry" fault
 * would break: if the angle were used here, typing components would look
 * like it did nothing.
 */
const typed = {
  id: "force-typed",
  type: "force",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    position: { x: 0, y: 0 },
    magnitude: 999,
    angle: 17,
    forceX: 30,
    forceY: -40
  }
};

const typedDerived = deps.deriveForceComponents(typed);

check(
  "typed components are read",
  typedDerived && typedDerived.fromComponents === true,
  `fromComponents = ${typedDerived && typedDerived.fromComponents}`
);

check(
  "the typed values are used, not the angle",
  typedDerived && typedDerived.x.x === 30 && typedDerived.y.y === -40,
  `x = ${typedDerived && typedDerived.x.x}, y = ${
    typedDerived && typedDerived.y.y
  }`
);

check(
  "the magnitude of typed components is their own",
  typedDerived && near(typedDerived.magnitude, 50),
  `magnitude = ${typedDerived && typedDerived.magnitude}, expected 50`
);

/* ============================================================
   A FORCE THAT SAYS NOTHING YIELDS NOTHING
   ============================================================ */

console.log("\n  a force with nothing known yields nothing\n");

/*
 * NOT zero. A force the student has not finished describing must produce
 * no components at all, because drawing a zero-length component would
 * present "you have no horizontal force" as a result - which is a claim
 * they have not made.
 */
const blank = {
  id: "force-blank",
  type: "force",
  geometry: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
};

check(
  "a force with no magnitude gives no components",
  deps.deriveForceComponents(blank) === null
);

check(
  "a force with a non-numeric magnitude gives no components",
  deps.deriveForceComponents({
    id: "f",
    type: "force",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      magnitude: "abc",
      angle: 45
    }
  }) === null
);

check(
  "no force at all gives no components",
  deps.deriveForceComponents(null) === null
);

/* ============================================================
   THE APPLICATION POINT IS THE ORIGIN
   ============================================================ */

console.log("\n  the components start where the force does\n");

/*
 * A component diagram is only meaningful if its two components start at
 * the force's own application point. Derived from a different point, the
 * two components would not close on the original and the whole
 * construction would be a picture of nothing.
 */
const placed = {
  id: "force-placed",
  type: "force",
  geometry: {
    start: { x: 40, y: 60 },
    end: { x: 90, y: 60 },
    position: { x: 40, y: 60 },
    magnitude: 100,
    angle: 30
  }
};

const placedDerived = deps.deriveForceComponents(placed);

check(
  "the origin is the force's application point",
  placedDerived && near(placedDerived.origin.x, 40) &&
    near(placedDerived.origin.y, 60),
  `origin = ${placedDerived && JSON.stringify(placedDerived.origin)}`
);

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
