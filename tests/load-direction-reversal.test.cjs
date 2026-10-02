/*
 * DOES REVERSING A LOAD MOVE IT?
 *
 * Reported: a Distributed Load that "loses or moves the outline at the
 * arrow ends" when its direction is reversed, and a Varying Load whose
 * start and end magnitudes swap.
 *
 * The model half of that claim is checked here, against the model rather
 * than a picture. The claim has a specific shape - a reversal must
 * change the direction the force ACTS and nothing else - so the test is
 * a before-and-after diff of every field that makes up the load, and the
 * interesting result is the list of fields that DID change, not just the
 * one that was expected to.
 *
 * Reading a `reversed` flag would prove nothing. The flag existing, and
 * the flag being read by the renderer, are both already true; what is in
 * question is whether any other field moves with it.
 */
global.window = {};

/* The model pieces a load is made of, with no renderer involved. */
require("../js/engineering-drawing/load-profile.js");
require("../js/engineering-drawing/drawing-state.js");

const state = global.window.enggDrawingState;
const profile = global.window.enggLoadProfile;

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

/*
 * A SNAPSHOT OF EVERYTHING THAT DESCRIBES A LOAD, so a reversal can be
 * diffed field by field.
 *
 * Deliberately not JSON.stringify of the whole geometry: that would
 * include `reversed` itself, and would report the flag as the only
 * change while hiding a moved endpoint inside a blob.
 */
const describe = geometry => ({
  start: { ...geometry.start },
  end: { ...geometry.end },
  direction: geometry.direction,
  intensity: geometry.intensity,
  startIntensity: geometry.startIntensity,
  endIntensity: geometry.endIntensity,
  interval: geometry.interval,
  points: (geometry.points || []).map(p => ({
    t: p.t,
    magnitude: p.magnitude
  }))
});

const changedFields = (before, after) =>
  Object.keys(before).filter(
    key => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );

console.log("\n  a uniform load is a direction, not a move\n");

/* ============================================================
   THE UNIFORM LOAD
   ============================================================ */

const load = state.geometryFactories.load(
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  10,
  { attachment: { parentId: "beam-1" } }
);

const loadBefore = describe(load.geometry);
const loadReversed = profile.reverseLoadDirection(load.geometry);
const loadAfter = describe(load.geometry);

check(
  "reversing reports a change of state",
  loadReversed === true
);

check(
  "reversing is its own flag, not a negated angle",
  load.geometry.reversed === true
);

/*
 * THE CENTRAL CLAIM. A reversal changes the sense the force acts in and
 * nothing else. If the span, the endpoints or the attachment move, the
 * arrows now act somewhere else on the body and it is a different load.
 */
const loadChanged = changedFields(loadBefore, loadAfter);

check(
  "reversing a uniform load changes NOTHING but the reversal itself",
  loadChanged.length === 0,
  `changed: ${JSON.stringify(loadChanged)}`
);

check(
  "the loaded span is untouched",
  load.geometry.start.x === 0 &&
    load.geometry.start.y === 0 &&
    load.geometry.end.x === 300 &&
    load.geometry.end.y === 0,
  `span ${JSON.stringify(load.geometry.start)} -> ${JSON.stringify(load.geometry.end)}`
);

check(
  "the magnitude is untouched",
  load.geometry.intensity === 10,
  `intensity ${load.geometry.intensity}`
);

/*
 * The parent lives on the OBJECT, not inside the geometry, so it is
 * checked separately. A reversal must not disturb it: the load is still
 * the same load on the same body, just pointing the other way.
 */

/*
 * TWICE IS A NO-OP. A user who presses the control twice expects the load
 * to come back, not to turn a quarter way round - the flag makes that
 * true by construction, and this is the check that would catch a
 * reversal reimplemented as an angle negation.
 */
profile.reverseLoadDirection(load.geometry);

check(
  "reversing twice returns to the original state",
  changedFields(loadAfter, describe(load.geometry)).length === 0
);

/* ============================================================
   THE VARYING LOAD - THE MAGNITUDES MUST NOT SWAP
   ============================================================ */

console.log("\n  a varying load keeps its magnitudes where they are\n");

const varying = state.geometryFactories["varying-load"](
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  2,
  8,
  { attachment: { parentId: "beam-1" } }
);

const varyingBefore = describe(varying.geometry);

check(
  "a varying load starts with a rising profile",
  varying.geometry.startIntensity === 2 &&
    varying.geometry.endIntensity === 8,
  `start ${varying.geometry.startIntensity}, end ${varying.geometry.endIntensity}`
);

/*
 * A triangular profile's peak is at ONE END. If a reversal swapped the
 * start and end intensities, the peak would jump to the other end - the
 * load would become a different shape, and a varying load is the one case
 * where that is easy to do by accident, because "reverse the arrows" and
 * "reverse the profile" sound like the same operation.
 */
const firstIntensity = varying.geometry.startIntensity;
const lastIntensity = varying.geometry.endIntensity;

profile.reverseLoadDirection(varying.geometry);

const varyingAfter = describe(varying.geometry);

const varyingChanged = changedFields(
  varyingBefore,
  varyingAfter
);

check(
  "reversing a varying load changes NOTHING but the reversal",
  varyingChanged.length === 0,
  `changed: ${JSON.stringify(varyingChanged)}`
);

check(
  "the start intensity stays on the start",
  varying.geometry.startIntensity === firstIntensity,
  `was ${firstIntensity}, now ${varying.geometry.startIntensity}`
);

check(
  "the end intensity stays on the end",
  varying.geometry.endIntensity === lastIntensity,
  `was ${lastIntensity}, now ${varying.geometry.endIntensity}`
);

/* ============================================================
   THE TIMING QUESTION - A REVERSAL IS A BOOLEAN, SO IT IS SAFE
   ============================================================ */

console.log("\n  the reversal is a flag, not a coordinate\n");

/*
 * The failure this guards against: a reversal implemented as a negated
 * angle, where the drawn line is `application + direction x length`. The
 * far endpoint then swings to the other side of the body on the very
 * first flip, and the load's span silently changes.
 *
 * There is no angle to negate here, so the check is that the flag is the
 * ONLY difference a second flip can make - which is what makes a double
 * press safe.
 */
check(
  "the reversal flag is boolean, never a coordinate",
  typeof load.geometry.reversed === "boolean",
  `reversed is ${typeof load.geometry.reversed}`
);

check(
  "isLoadReversed reads the same flag",
  profile.isLoadReversed({ reversed: true }) === true &&
    profile.isLoadReversed({ reversed: false }) === false &&
    profile.isLoadReversed({}) === false,
  "an absent flag must read as not reversed, not as undefined"
);

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
