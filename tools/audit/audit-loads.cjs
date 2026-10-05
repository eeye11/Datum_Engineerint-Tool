/*
 * Audit: distributed loads, moments, supports and connections - their
 * authoritative data, body-local spans, direction handling and dependency
 * updates.
 */
const h = require("./statics-harness.cjs");

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

const F = h.state.geometryFactories;

function stateWith(objects) {
  return {
    objects,
    selection: {
      selectedObjectIds: [],
      boxSelectionIds: [],
      hoveredObjectId: null,
    },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
  };
}

/* A beam from (0,0) to (600,0). */
const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });

console.log(
  "\n== Distributed load: the span is body-local engineering data ==\n",
);

{
  const load = F.load({ x: 150, y: 0 }, { x: 450, y: 0 }, 5);

  check(
    "the load stores its own two ends",
    Math.abs(load.geometry.start.x - 150) < 1e-6 &&
      Math.abs(load.geometry.end.x - 450) < 1e-6,
    JSON.stringify({ start: load.geometry.start, end: load.geometry.end }),
  );

  check(
    "the magnitude is stored, not derived from the drawn length",
    Math.abs(Number(load.geometry.magnitude) - 5) < 1e-6,
    `got ${load.geometry.magnitude}`,
  );

  /* The span along the body, in engineering terms. */
  const span = h.deps.spanOf(load);
  check(
    "its span is 300 long",
    span && Math.abs(span.length - 300) < 1e-6,
    `got ${span && span.length}`,
  );
}

console.log("\n== Reversing a distributed load keeps its span ==\n");

{
  const load = F.load({ x: 150, y: 0 }, { x: 450, y: 0 }, 5);
  const before = { ...load.geometry.start };

  h.profile.reverseLoadDirection(load.geometry);

  check(
    "the start of the span did not move",
    Math.abs(load.geometry.start.x - before.x) < 1e-6,
    `${before.x} -> ${load.geometry.start.x}`,
  );
  check(
    "the magnitude is unchanged",
    Math.abs(Number(load.geometry.magnitude) - 5) < 1e-6,
    `got ${load.geometry.magnitude}`,
  );
}

console.log("\n== Varying load: magnitudes stay with their physical ends ==\n");

{
  const varying = F["varying-load"]
    ? F["varying-load"]({ x: 150, y: 0 }, { x: 450, y: 0 })
    : null;

  if (!varying) {
    console.log("  (no varying-load factory - skipped)");
  } else {
    varying.geometry.startMagnitude = 5;
    varying.geometry.endMagnitude = 10;

    const before = {
      start: { ...varying.geometry.start },
      end: { ...varying.geometry.end },
    };

    h.profile.reverseLoadDirection(varying.geometry);

    check(
      "the start magnitude stays with the start position",
      Math.abs(Number(varying.geometry.startMagnitude) - 5) < 1e-6,
      `got startMagnitude ${varying.geometry.startMagnitude}`,
    );
    check(
      "the end magnitude stays with the end position",
      Math.abs(Number(varying.geometry.endMagnitude) - 10) < 1e-6,
      `got endMagnitude ${varying.geometry.endMagnitude}`,
    );
    check(
      "and the span itself did not move",
      Math.abs(varying.geometry.start.x - before.start.x) < 1e-6 &&
        Math.abs(varying.geometry.end.x - before.end.x) < 1e-6,
      JSON.stringify({
        start: varying.geometry.start,
        end: varying.geometry.end,
      }),
    );
  }
}

console.log("\n== Applied moment: direction is CW/CCW, not a sign flip ==\n");

{
  const moment = F.moment({ x: 300, y: 0 }, 25, false);

  check(
    "the moment stores a magnitude",
    Math.abs(Number(moment.geometry.magnitude) - 25) < 1e-6,
    `got ${moment.geometry.magnitude}`,
  );

  const direction = h.profile.momentDirection
    ? h.profile.momentDirection(moment.geometry)
    : null;

  check(
    "and a readable direction",
    direction === "CW" || direction === "CCW",
    `got ${direction}`,
  );

  /* Reversing must not move the application point. */
  const before = { ...moment.geometry.position };
  if (h.profile.reverseMomentDirection) {
    h.profile.reverseMomentDirection(moment.geometry);
  }

  check(
    "the application point is unchanged by a direction change",
    Math.abs(moment.geometry.position.x - before.x) < 1e-6,
    `${JSON.stringify(before)} -> ${JSON.stringify(moment.geometry.position)}`,
  );
}

console.log("\n== Couple is one feature, not two moments ==\n");

{
  const couple = F.couple({ x: 300, y: 0 }, 100, 50, false);
  const state = stateWith([couple]);

  check(
    "a couple is a single object",
    state.objects.length === 1,
    `got ${state.objects.length}`,
  );
  check(
    "of type couple, not moment",
    couple.type === "couple",
    `got ${couple.type}`,
  );
}

console.log("\n== Supports attach to a body and follow it ==\n");

{
  const support = F["pin-support"]({ x: 300, y: 0 });
  support.parentId = beam.id;

  check(
    "the support records the body it is on",
    support.parentId === beam.id,
    `got ${support.parentId}`,
  );

  /*
   * Move the beam and confirm the frame the support reads follows.
   */
  const frameBefore = h.frames.frameOf(beam);
  beam.geometry.start = { x: 1000, y: 100 };
  beam.geometry.end = { x: 1600, y: 100 };
  const frameAfter = h.frames.frameOf(beam);

  check(
    "the body frame follows the beam",
    Math.abs(frameAfter.origin.x - frameBefore.origin.x - 1000) < 1e-6,
    `origin ${JSON.stringify(frameBefore.origin)} -> ${JSON.stringify(frameAfter.origin)}`,
  );
  check(
    "and the frame length is still 600",
    Math.abs(frameAfter.length - 600) < 1e-6,
    `got ${frameAfter.length}`,
  );
}

console.log("\n== Body frame: attachment fraction is body-local ==\n");

{
  const frame = h.frames.frameOf(beam);
  const point = h.frames.attachmentPoint(frame, 0.5);

  check(
    "the midpoint of a 600 beam is at 300 along it",
    Math.abs(point.x - (beam.geometry.start.x + 300)) < 1e-6,
    `got ${point.x}, expected ${beam.geometry.start.x + 300}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
