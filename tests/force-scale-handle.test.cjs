/*
 * A FORCE'S ARROWHEAD, AT EVERY VECTOR SCALE.
 *
 * A Point Force stores its vector as `end`, and that stored value is the
 * ENGINEERING force: it sits exactly `magnitude` from the application
 * point. The arrow, however, is drawn at the shared Statics display
 * scale, so at 4x its arrowhead is four times further out than the
 * stored end.
 *
 * That gap is visible. The end is also a manipulation handle, so a
 * handle drawn at the stored end sits in the MIDDLE of its own arrow -
 * a floating dot the user cannot explain - and grabbing it would shorten
 * the force to a quarter of what is on screen.
 *
 * So the handle is placed where the arrow actually ends, and a drag of
 * that handle has the scale taken back off before the value is stored.
 * These checks pin both halves, because either one alone would leave the
 * other broken: a handle in the right place that stores the wrong value,
 * or a correct conversion with the handle still floating.
 */

global.window = {
  crypto: {
    randomUUID: () => "force-scale-handle-uuid"
  }
};

require("../js/engineering-drawing/load-profile.js");

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

console.log("\n  force arrowhead and the vector scale\n");

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

const at = (scale, magnitude = 100, angle = 0) => {
  const state = { statics: { vectorScale: scale } };

  const geometry = profile.setForceVector(
    { start: { x: 0, y: 0 }, position: { x: 0, y: 0 } },
    magnitude,
    angle
  );

  return { state, geometry };
};

/* --- The drawn tip follows the display scale. */
[0.25, 0.5, 1, 2, 4].forEach((scale) => {
  const { state, geometry } = at(scale);

  const tip = profile.drawnForceEnd(state, geometry);

  check(
    `at ${scale}x the arrowhead sits at magnitude x scale`,
    near(tip.x, 100 * scale) && near(tip.y, 0),
    `tip = ${tip.x},${tip.y}, expected ${100 * scale}`
  );

  check(
    `at ${scale}x the STORED end is still the engineering value`,
    near(geometry.end.x, 100) && near(geometry.end.y, 0),
    `end = ${geometry.end.x},${geometry.end.y}`
  );
});

/* --- The application point never moves. */
[0.25, 1, 4].forEach((scale) => {
  const { state, geometry } = at(scale, 100);

  const tip = profile.drawnForceEnd(state, geometry);

  check(
    `at ${scale}x the application point is where it was put`,
    near(geometry.start.x, 0) && near(geometry.start.y, 0),
    `start = ${geometry.start.x},${geometry.start.y}`
  );

  check(
    `at ${scale}x the arrowhead is measured from that application point`,
    near(Math.hypot(tip.x, tip.y), 100 * scale, 1e-6),
    `distance = ${Math.hypot(tip.x, tip.y)}`
  );
});

/*
 * --- The round trip.
 *
 * Releasing the arrowhead exactly where it already sits must leave the
 * force unchanged. This is the case that catches a missing scale
 * conversion: at 4x, storing the drawn distance unconverted would cut
 * the force to a quarter while the user held it still.
 */
[0.25, 0.5, 1, 2, 4].forEach((scale) => {
  const { state, geometry } = at(scale, 100);

  const tip = profile.drawnForceEnd(state, geometry);

  const round = profile.forceVectorFromDrawnPoint(
    state,
    geometry,
    tip
  );

  check(
    `at ${scale}x grabbing the arrowhead where it is changes nothing`,
    near(round.magnitude, 100, 1e-6) && near(round.angle, 0, 1e-6),
    `magnitude = ${round.magnitude}, angle = ${round.angle}`
  );
});

/* --- Direction survives the round trip. */
[0.25, 1, 4].forEach((scale) => {
  const { state, geometry } = at(scale, 100, 37);

  const tip = profile.drawnForceEnd(state, geometry);

  const round = profile.forceVectorFromDrawnPoint(
    state,
    geometry,
    tip
  );

  check(
    `at ${scale}x the direction survives the round trip`,
    near(round.angle, 37, 1e-6),
    `angle = ${round.angle}`
  );
});

/* --- Dragging the head further out really does make the force bigger. */
{
  const { state, geometry } = at(2, 100);

  const tip = profile.drawnForceEnd(state, geometry);

  const dragged = profile.forceVectorFromDrawnPoint(
    state,
    geometry,
    { x: tip.x + 100, y: tip.y }
  );

  check(
    "dragging the head further out at 2x increases the magnitude",
    near(dragged.magnitude, 150, 1e-6),
    `magnitude = ${dragged.magnitude}, expected 150`
  );
}

/* --- Grabbing the point it was already at is not a collapse. */
{
  const { state, geometry } = at(4, 100);

  const onTop = profile.forceVectorFromDrawnPoint(
    state,
    geometry,
    geometry.start
  );

  check(
    "releasing on the application point keeps the force rather than zeroing it",
    near(onTop.magnitude, 100, 1e-6),
    `magnitude = ${onTop.magnitude}`
  );
}

/* --- An unusable scale falls back rather than dividing by zero. */
{
  const geometry = profile.setForceVector(
    { start: { x: 0, y: 0 } },
    100,
    0
  );

  const bad = { statics: { vectorScale: NaN } };

  const tip = profile.drawnForceEnd(bad, geometry);

  check(
    "an unusable scale draws at 1x rather than failing",
    near(tip.x, 100),
    `tip = ${tip.x}`
  );
}

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
