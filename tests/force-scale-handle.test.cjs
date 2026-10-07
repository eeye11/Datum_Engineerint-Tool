
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * A FORCE'S DRAWN LINE, AGAINST THE SHARED VECTOR SCALE.
 *
 * A Point Force stores an APPLICATION POINT, a MAGNITUDE and a DIRECTION.
 * The line it is drawn along is rebuilt from those three facts and the current
 * Visual Force Scale: it runs from the application point, along the stored
 * direction, for `magnitude x scale`. Nothing about the drawn endpoint is
 * remembered between frames, so changing the scale moves the endpoint and every
 * consumer - the line, the arrowhead, the handle, the annotation - reads the
 * same recalculated endpoint.
 *
 * REVERSING A FORCE turns the direction through a half turn. The line then
 * runs the other way from the same application point, and the head arrives at
 * the other end of it - exactly as a Distributed Load's arrowheads move when
 * it is reversed while its span stays put.
 */


global.window = {
  crypto: {
    randomUUID: () => "force-scale-handle-uuid"
  }
};

loadModule("load-profile.js");

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

/*
 * --- THE SCALE STRETCHES THE DRAWN LINE.
 *
 * This is the check that was missing when the control silently did nothing.
 * The drawn arrow is the span, so with the tip read straight off the span's
 * end there was nothing left for the scale to multiply and every value drew
 * identically. Growing the line outward from the application point keeps the
 * scale doing its job AND keeps a reversal from moving the line, because the
 * growth is the same either way round.
 */
[0.001, 0.25, 1, 4, 1000].forEach((scale) => {
  const state = { statics: { vectorScale: scale } };

  const geometry = {
    start: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    magnitude: 100,
    angle: 0,
  };

  const head = profile.drawnForceEnd(state, geometry);
  const tail = profile.drawnForceTail(state, geometry);

  check(
    `at ${scale}x the drawn line is the span at that scale`,
    near(Math.abs(head.x - tail.x), 100 * scale, 1e-6),
    `drawn length ${Math.abs(head.x - tail.x)}, expected ${100 * scale}`,
  );

  check(
    `at ${scale}x it still grows from the point the force acts at`,
    near(tail.x, 0) && near(head.x, 100 * scale, 1e-6),
    `tail ${tail.x}, head ${head.x}`,
  );

  check(
    `at ${scale}x the stored geometry is untouched by the display scale`,
    near(geometry.end.x, 100) && near(geometry.start.x, 0),
    `end ${geometry.end.x}`,
  );
});

/*
 * --- THE LINE IS REBUILT FROM THE VECTOR, SO A REVERSAL TURNS IT ROUND.
 *
 * The drawn line runs from the APPLICATION POINT along the stored direction.
 * Reversing the force turns the direction through a half turn, so the line
 * leaves the same application point in the opposite direction. The head is at
 * the far end of the new line and the tail at the application point - the same
 * arrangement a Distributed Load has when it is reversed.
 */
[0.001, 1, 1000].forEach((scale) => {
  const state = { statics: { vectorScale: scale } };

  const geometry = {
    start: { x: 100, y: 50 },
    position: { x: 100, y: 50 },
    end: { x: 150, y: 50 },
    magnitude: 50,
    angle: 0,
  };

  const tipBefore = profile.drawnForceEnd(state, geometry);

  profile.reverseForceDirection(geometry);

  const tipAfter = profile.drawnForceEnd(state, geometry);
  const tailAfter = profile.drawnForceTail(state, geometry);

  check(
    `at ${scale}x a reversal turns the drawn line round its application point`,
    near(tailAfter.x, 100) &&
      near(tailAfter.y, 50) &&
      near(tipAfter.x, 100 - 50 * scale, 1e-6),
    `tail ${tailAfter.x},${tailAfter.y}, head ${tipAfter.x},${tipAfter.y}`,
  );

  check(
    `at ${scale}x the head moved across the application point`,
    near(tipBefore.x, 100 + 50 * scale, 1e-6) &&
      near(tipAfter.x, 100 - 50 * scale, 1e-6),
    `head went ${tipBefore.x} -> ${tipAfter.x}`,
  );
});

/*
 * --- WITH NO SPAN, THE SCALE IS WHAT DECIDES THE DRAWN LENGTH.
 *
 * This is the case the Vector Scale exists for: a force with no line to be
 * drawn along is drawn out from the point it acts at, and how far is a drawing
 * decision rather than an engineering one.
 */
[0.25, 0.5, 1, 2, 4].forEach((scale) => {
  const state = { statics: { vectorScale: scale } };

  const geometry = {
    start: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    magnitude: 100,
    angle: 0,
  };

  const tip = profile.drawnForceEnd(state, geometry);

  check(
    `at ${scale}x a force with no span is drawn at magnitude x scale`,
    near(tip.x, 100 * scale, 1e-6) && near(tip.y, 0),
    `tip = ${tip.x},${tip.y}, expected ${100 * scale},0`,
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
    `at ${scale}x the arrowhead is measured from the tail of the shaft`,
    near(
      Math.hypot(
        tip.x - profile.drawnForceTail(state, geometry).x,
        tip.y - profile.drawnForceTail(state, geometry).y,
      ),
      100 * scale,
      1e-6,
    ),
    `distance = ${Math.hypot(tip.x, tip.y)}`,
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

/*
 * --- THE SCALE IS A DRAWING SETTING, SO A DRAG TAKES IT BACK OFF.
 *
 * The drawn line is the span at `vectorScale`, so the distance the user
 * dragged is a drawing distance and has to be divided back down to an
 * engineering one. Dividing by it is what makes a force grow every time it is
 * grabbed.
 */
{
  const { state, geometry } = at(2, 100);

  const tip = profile.drawnForceEnd(state, geometry);

  const onTop = profile.forceVectorFromDrawnPoint(
    state,
    geometry,
    tip
  );

  check(
    "at 2x a head grabbed and released where it is is still the same force",
    near(onTop.magnitude, 100, 1e-6),
    `magnitude = ${onTop.magnitude}`,
  );

  const dragged = profile.forceVectorFromDrawnPoint(state, geometry, {
    x: tip.x + 100,
    y: tip.y,
  });

  check(
    "dragging the head a hundred further out at 2x increases the force",
    near(dragged.magnitude, 150, 1e-6),
    `magnitude = ${dragged.magnitude}, expected 150`,
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

/* ============================================================
   ONE FORCE, ONE DIRECTION
   ============================================================ */

console.log("\n  a force describes itself consistently, whichever way it is read\n");

/*
 * A FORCE IS DESCRIBED TWICE, AND THE TWO MUST AGREE.
 *
 * A Point Force may state a magnitude and an angle, or its X and Y
 * components - the panel offers both and they are meant to be
 * interchangeable. `forceVector` gives the COMPONENTS precedence, because a
 * student who has just typed Fx and Fy means those whatever the angle field
 * still says.
 *
 * THAT PRECEDENCE IS WHAT BROKE A REVERSAL. `setForceVector` rewrote the
 * angle and the stored end and left forceX/forceY pointing the old way, so
 * reversing a force whose components had ever been typed produced an object
 * holding two contradictory descriptions of one force. The renderer reads
 * the stored end; everything else reads the components first - so the angle
 * said the arrow had turned while the components said it had not, and which
 * one a reader believed decided whether "reverse direction" appeared to work
 * at all.
 *
 * The symptom was not a broken arrow. It was the arrowhead moving to the
 * other end of an unchanged vector: the drawing "flipping how it is drawn"
 * while the force stayed where it was pointed.
 */
{
  const geometry = {
    start: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    end: { x: 30, y: 40 },
    magnitude: 50,
    angle: 53.13010235415598,
    forceX: 30,
    forceY: 40,
  };

  profile.reverseForceDirection(geometry);

  const vector = profile.forceVector(geometry);

  /*
   * THE COMPONENTS MUST HAVE TURNED AROUND.
   */
  check(
    "reversing turns the components round",
    vector.fx < 0 && vector.fy < 0,
    `components = ${vector.fx}, ${vector.fy} (expected both negative)`,
  );

  /*
   * AND THE SPAN MUST NOT MOVE. This is what changed, and it is the whole of
   * the reported fault.
   *
   * `end` used to be rewritten from the reversed angle, so the tip crossed to
   * the other side of the application point: a force drawn between x=100 and
   * x=150 became one drawn between x=50 and x=100. The LENGTH was even right,
   * which is why it was easy to miss - what moved was which part of the drawing
   * the arrow lay on, and for a force on a member that is the difference
   * between pressing on the beam and pressing on the space beside it.
   *
   * So the span is where the student put it, and the direction says which way
   * it pushes. They are read separately.
   */
  check(
    "reversing leaves the span exactly where it was drawn",
    geometry.end.x === 30 && geometry.end.y === 40,
    `end moved to ${geometry.end.x},${geometry.end.y}`,
  );

  /*
   * AND THE APPLICATION POINT MUST NOT HAVE MOVED - the whole point of a
   * reversal is that the same force acts at the same place, pointing the
   * other way.
   */
  check(
    "and the application point stays exactly where it was",
    geometry.start.x === 0 && geometry.start.y === 0,
    `start = ${JSON.stringify(geometry.start)}`,
  );

  check(
    "the magnitude is untouched by a reversal",
    near(vector.magnitude, 50, 1e-9),
    `magnitude = ${vector.magnitude}`,
  );
}

/*
 * --- REVERSING TURNS THE DRAWN LINE AROUND ITS APPLICATION POINT.
 *
 * The line is rebuilt from the application point along the stored direction, so
 * a reversal sends the head to the opposite side of the same point - the
 * application point is where the force acts and it does not move.
 */
{
  const state = { statics: { vectorScale: 1 } };

  const geometry = {
    start: { x: 100, y: 50 },
    position: { x: 100, y: 50 },
    end: { x: 150, y: 50 },
    magnitude: 50,
    angle: 0,
    forceX: 50,
    forceY: 0,
  };

  const before = profile.drawnForceEnd(state, geometry);

  profile.reverseForceDirection(geometry);

  const after = profile.drawnForceEnd(state, geometry);
  const tail = profile.drawnForceTail(state, geometry);

  check(
    "the stored span is untouched by a reversal",
    geometry.start.x === 100 &&
      geometry.start.y === 50 &&
      geometry.end.x === 150 &&
      geometry.end.y === 50,
    `span is ${JSON.stringify(geometry.start)} to ${JSON.stringify(geometry.end)}`,
  );

  check(
    "the head moved to the other side of the application point",
    near(before.x, 150) &&
      near(after.x, 50) &&
      near(after.y, 50) &&
      near(tail.x, 100) &&
      near(tail.y, 50),
    `head went ${before.x} -> ${after.x}, tail is now ${tail.x}`,
  );
}

/*
 * A COMPONENT EDIT MUST STILL ROUND-TRIP, or fixing the reversal has simply
 * traded one inconsistency for another. Typing Fx and Fy goes through the
 * same function, so the angle and the stored end have to follow them.
 */
{
  const geometry = profile.setForceVector(
    { start: { x: 0, y: 0 }, position: { x: 0, y: 0 } },
    100,
    0,
  );

  profile.setForceVector(geometry, 100, 90);

  const vector = profile.forceVector(geometry);

  check(
    "editing the direction leaves no stale components behind",
    near(vector.fx, 0, 1e-9) && near(vector.fy, 100, 1e-9),
    `components = ${vector.fx}, ${vector.fy}`,
  );

  check(
    "and the stored end follows the same vector",
    near(geometry.end.x, 0, 1e-9) && near(geometry.end.y, 100, 1e-9),
    `end = ${JSON.stringify(geometry.end)}`,
  );
}

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
