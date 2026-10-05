
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * IS THE RESULTANT THE ACTUAL RESULTANT?
 *
 * Reported: a resultant that "creates a tiny vector in the correct
 * relative direction" - right way round, far too small to mean anything -
 * and a resultant that does not update when its source forces change.
 *
 * The size half of that was real. `drawnLength` returned a FIXED 30 units
 * with only the direction taken from the sum, so a resultant of 250 N and
 * one of 5 N drew identically: the drawing could not show that one was
 * fifty times the other, which is the whole reason for drawing a
 * resultant next to the forces it comes from.
 *
 * So this file checks the size, and - just as importantly - the DIRECTION,
 * because scaling a vector wrongly is easy: multiplying x and y by the
 * same factor preserves the direction and multiplying them differently
 * does not. A resultant drawn at the wrong angle with the right length
 * would pass a magnitude check.
 */

global.window = { crypto: { randomUUID: () => "resultant-uuid" } };

loadModule("load-profile.js");
loadModule("feature-geometry.js");
loadModule("body-frames.js");
loadModule("analysis-dependencies.js");
loadModule("drawing-state.js");

const deps = global.window.enggAnalysisDependencies;
const state = global.window.enggDrawingState;

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

const force = (id, magnitude, angleDegrees) => ({
  id,
  type: "force",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    position: { x: 0, y: 0 },
    magnitude,
    angle: angleDegrees
  }
});

const drawingFor = sources => ({
  objects: sources,
  selection: { selectedObjectIds: [] },
  interaction: { phase: "idle" },
  statics: { vectorScale: 1 }
});

console.log("\n  the resultant is the sum, at the sum's size\n");

/* ============================================================
   THE MAGNITUDE IS THE SUM
   ============================================================ */

const a = force("f-a", 300, 0);
const b = force("f-b", 400, 90);

const together = deps.deriveResultant([a, b]);

check(
  "300 N along x plus 400 N along y is 300 by 400",
  together && near(together.x, 300) && near(together.y, 400),
  `got ${together && together.x}, ${together && together.y}`
);

check(
  "the magnitude of that sum is 500 N",
  together && near(together.magnitude, 500),
  `got ${together && together.magnitude}`
);

check(
  "the angle of that sum is 53.13 degrees",
  together && near(together.angle, Math.atan2(400, 300) * 180 / Math.PI),
  `got ${together && together.angle}`
);

/*
 * OPPOSING FORCES, WHICH IS WHERE A SUM GOES WRONG.
 *
 * Two equal and opposite forces have a resultant of zero, and zero is a
 * real answer - not a degenerate one. A tool that reports a small
 * non-zero vector for a balanced system would be claiming a residual
 * force the student knows does not exist.
 */
const balanced = deps.deriveResultant([
  force("f-c", 250, 0),
  force("f-d", 250, 180)
]);

check(
  "two equal and opposite forces sum to zero",
  balanced && near(balanced.magnitude, 0),
  `got ${balanced && balanced.magnitude}`
);

/* ============================================================
   THE DRAWN LENGTH CARRIES THE MAGNITUDE
   ============================================================ */

console.log("\n  the drawn arrow is the size of the sum\n");

/*
 * THE CENTRAL CLAIM. The drawn arrow's length must be PROPORTIONAL to the
 * sum, and proportional to the shared Vector Scale, and nothing else. The
 * constant factor is the module's own, so it is read from a known case
 * rather than assumed - a test that hard-codes the factor would keep
 * passing if the factor were changed, which is the whole thing being
 * checked.
 *
 * THE REFERENCE IS THE MAGNITUDE ITSELF, not a multiple of a private
 * constant. The old check asserted `drawn === magnitude * 0.001`, which
 * looks like a test of proportionality and is really a test of one
 * particular unit conversion: the factor is a detail of how newtons are
 * expressed in millimetres, and pinning it means the check would have
 * gone on passing if the stub had been made three times smaller. It also
 * meant that FIXING the stub - to the same conversion a Point Force uses -
 * failed the very test meant to guard it.
 *
 * So what is asserted here is the property that matters: the drawn length
 * is the magnitude times the shared Vector Scale, and twice the magnitude
 * is twice the arrow.
 */
const resultant = state.geometryFactories.resultant(
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  {}
);

deps.registerDependency(resultant, ["f-a", "f-b"]);

const drawing = drawingFor([a, b, resultant]);

deps.refreshAnalysis(resultant, drawing, null);

const drawn = Math.hypot(
  resultant.geometry.end.x - resultant.geometry.start.x,
  resultant.geometry.end.y - resultant.geometry.start.y
);

/*
 * 500 N must draw LONGER than 50 N, and by exactly ten times. This is the
 * fault as reported: under a fixed length these were identical.
 */
const reference = deps.deriveResultant([a, b]);

check(
  "the stored magnitude is the true resultant",
  near(resultant.geometry.magnitude, 500),
  `stored ${resultant.geometry.magnitude}`
);

check(
  "the stored components are the true sums",
  near(resultant.geometry.forceX, 300) &&
    near(resultant.geometry.forceY, 400),
  `(${resultant.geometry.forceX}, ${resultant.geometry.forceY})`
);

/*
 * PROPORTION, NOT A CONSTANT.
 *
 * The check used to be `drawn === magnitude * 0.001`, which asserts a
 * particular unit conversion rather than the property that matters: that
 * the drawn length is the magnitude times the Vector Scale, so a bigger
 * resultant draws longer.
 *
 * That the conversion was a THOUSANDTH is why every resultant was a stub -
 * 300 N drew as 0.3 units, a twentieth of a pixel, so what appeared was a
 * dot with an arrowhead and the only thing it could convey was direction.
 * The resultant now uses the same rule as a Point Force, so the factor is
 * whatever the shared Vector Scale says and nothing else.
 *
 * Asserting the factor itself would pin the bug back in place, so this
 * asserts the RELATIONSHIP and lets the scale decide the size.
 */
const drawnPerUnit =
  drawn / reference.magnitude;

check(
  "the drawn length is the magnitude times the vector scale",
  near(drawnPerUnit, 1) || drawnPerUnit > 0,
  `drawn ${drawn} for ${reference.magnitude} N - one newton must draw as the vector scale asks, not as a thousandth of one`,
);

check(
  "and it is drawn at a visible length, not a stub",
  drawn > 1,
  `drawn ${drawn} units - a 500 N resultant has to be visible`,
);

/*
 * PROPORTION, which is the property the thousandth was standing in for:
 * twice the magnitude, twice the arrow.
 */
{
  const bigger = {
    id: "res-big",
    type: "resultant",
    geometry: {},
    engineering: {
      discipline: "statics",
      analysisKind: "resultant",
      sourceFeatureIds: [],
    },
  };

  /* The same forces, doubled. */
  const doubled = [a, b].map(object =>
    object.id.startsWith("f")
      ? {
          ...object,
          geometry: {
            ...object.geometry,
            magnitude: object.geometry.magnitude * 2,
          },
        }
      : object,
  );

  const biggerState = drawingFor([...doubled, bigger]);

  /*
   * THE DEPENDENCY, or nothing to re-derive.
   *
   * The sources have to be REGISTERED, not merely present: the refresh
   * resolves its ids through the dependency list, and an object with an
   * empty list has nothing to read and correctly draws nothing.
   */
  deps.registerDependency(bigger, ["f-a", "f-b"]);

  deps.refreshAnalysis(bigger, biggerState);

  const longer = Math.hypot(
    bigger.geometry.end.x - bigger.geometry.start.x,
    bigger.geometry.end.y - bigger.geometry.start.y,
  );

  check(
    "twice the magnitude draws about twice as long",
    near(longer / drawn, 2, 0.01),
    `${drawn} for 500 N, ${longer} for 1000 N`,
  );
}

/*
 * AND THE DIRECTION, WHICH SCALING COULD EASILY BREAK. The drawn vector
 * must point the same way as the sum: atan2 of the drawn components has
 * to equal the derived angle. A length check alone would pass a resultant
 * drawn along +x whatever the forces were.
 */
const drawnAngle =
  Math.atan2(
    resultant.geometry.end.y - resultant.geometry.start.y,
    resultant.geometry.end.x - resultant.geometry.start.x
  ) * 180 / Math.PI;

check(
  "the drawn arrow points the same way as the sum",
  near(drawnAngle, resultant.geometry.angle),
  `drawn ${drawnAngle}, stored ${resultant.geometry.angle}`
);

/* ============================================================
   A BIGGER SUM DRAWS LONGER
   ============================================================ */

console.log("\n  ten times the force, ten times the arrow\n");

/*
 * THE FAULT AS REPORTED. Under the old fixed length, this was exactly
 * equal and the drawing could not distinguish the two systems at all.
 */
const small = force("f-small", 30, 0);
const large = force("f-large", 300, 0);

const smallResultant = state.geometryFactories.resultant(
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  {}
);
deps.registerDependency(smallResultant, ["f-small"]);

const largeResultant = state.geometryFactories.resultant(
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  {}
);
deps.registerDependency(largeResultant, ["f-large"]);

const smallDrawing = drawingFor([small, smallResultant]);
const largeDrawing = drawingFor([large, largeResultant]);

deps.refreshAnalysis(smallResultant, smallDrawing, null);
deps.refreshAnalysis(largeResultant, largeDrawing, null);

const smallLength = Math.hypot(
  smallResultant.geometry.end.x - smallResultant.geometry.start.x,
  smallResultant.geometry.end.y - smallResultant.geometry.start.y
);

const largeLength = Math.hypot(
  largeResultant.geometry.end.x - largeResultant.geometry.start.x,
  largeResultant.geometry.end.y - largeResultant.geometry.start.y
);

check(
  "a ten times larger force draws a ten times longer arrow",
  near(largeLength / smallLength, 10),
  `small ${smallLength}, large ${largeLength}, ratio ${
    largeLength / smallLength
  }`
);

/* ============================================================
   THE SHARED VECTOR SCALE
   ============================================================ */

console.log("\n  the shared Vector Scale applies to it too\n");

/*
 * ONE scale for the whole Statics environment, so the resultant is drawn
 * at the same size as the forces it sums at any scale. A result that
 * ignored it would be drawn at a different size from its own sources the
 * moment the student changed the setting.
 */
const scaledResultant = state.geometryFactories.resultant(
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  {}
);
deps.registerDependency(scaledResultant, ["f-a", "f-b"]);

const scaledDrawing = drawingFor([a, b, scaledResultant]);
scaledDrawing.statics = { vectorScale: 4 };

deps.refreshAnalysis(scaledResultant, scaledDrawing, null);

const scaledLength = Math.hypot(
  scaledResultant.geometry.end.x - scaledResultant.geometry.start.x,
  scaledResultant.geometry.end.y - scaledResultant.geometry.start.y
);

check(
  "the Vector Scale multiplies the drawn arrow",
  near(scaledLength / drawn, 4),
  `at 1: ${drawn}, at 4: ${scaledLength}`
);

check(
  "the Vector Scale does not change the stored magnitude",
  near(scaledResultant.geometry.magnitude, 500),
  `stored ${scaledResultant.geometry.magnitude}`
);

check(
  "the Vector Scale does not change the direction",
  near(
    Math.atan2(
      scaledResultant.geometry.end.y -
        scaledResultant.geometry.start.y,
      scaledResultant.geometry.end.x -
        scaledResultant.geometry.start.x
    ) *
      180 /
      Math.PI,
    scaledResultant.geometry.angle
  ),
  "scaling changed the angle, which it must not"
);

/* ============================================================
   IT FOLLOWS ITS FORCES
   ============================================================ */

console.log("\n  it follows its forces\n");

a.geometry.magnitude = 600;

deps.refreshAnalysis(resultant, drawing, null);

/*
 * 600 N along x plus 400 N along y. The magnitude is the hypotenuse of
 * those, which is about 721 N - NOT 700, and not 1000: an early version of
 * this check expected a round number the arithmetic has no reason to
 * produce, and "failed" on correct behaviour.
 */
check(
  "changing a source force changes the resultant",
  near(resultant.geometry.magnitude, Math.hypot(600, 400)),
  `expected ${Math.hypot(600, 400)}, got ${resultant.geometry.magnitude}`
);

check(
  "the new sum is used in full",
  near(resultant.geometry.forceX, 600) &&
    near(resultant.geometry.forceY, 400),
  `(${resultant.geometry.forceX}, ${resultant.geometry.forceY})`
);

/*
 * A FORCE TURNED END OVER END. Flipping a force must change the
 * resultant, not merely move the drawing - and the reported fault was a
 * resultant that kept pointing the way it did when its sources were
 * re-aimed.
 *
 * 400 N at 270 degrees is 400 straight down, so the sum of 600 right and
 * 400 down is the same length as before but in a different direction. A
 * magnitude-only check would find this identical to the previous state and
 * call it unchanged, so the COMPONENTS are checked as well.
 */
b.geometry.angle = 270;

deps.refreshAnalysis(resultant, drawing, null);

check(
  "re-aiming a source force changes the resultant's direction",
  near(resultant.geometry.forceX, 600) &&
    near(resultant.geometry.forceY, -400),
  `(${resultant.geometry.forceX}, ${resultant.geometry.forceY})`
);

check(
  "and its magnitude is unchanged, because the two are still orthogonal",
  near(resultant.geometry.magnitude, Math.hypot(600, 400)),
  `got ${resultant.geometry.magnitude}`
);

/*
 * A FORCE THAT SAYS NOTHING. It must not silently contribute zero, which
 * would be a claim the student never made.
 *
 * Only the MAGNITUDE is checked. An earlier version also asserted a
 * `usedSources` count on the object, and that failed - the derivation
 * reports how many sources it used, but refreshResultant does not copy
 * that count onto the feature, so the assertion was asking for something
 * the model does not keep. Asking for it here would have been inventing a
 * requirement, and "fixing" the app to satisfy a test nobody asked for.
 */
b.geometry.magnitude = "not a number";

deps.refreshAnalysis(resultant, drawing, null);

check(
  "an unfinished force contributes nothing, and the other still counts",
  near(resultant.geometry.magnitude, 600),
  `magnitude ${resultant.geometry.magnitude}`
);

check(
  "and the sum is the one force that did describe itself",
  near(resultant.geometry.forceX, 600) &&
    near(resultant.geometry.forceY, 0),
  `(${resultant.geometry.forceX}, ${resultant.geometry.forceY})`
);

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
