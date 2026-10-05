/*
 * Audit: the full cross-tool regression (§46, §58).
 *
 * Build the representative scene the specification names, then apply every
 * transformation and confirm all dependents update - no broken reference, no
 * duplicate object, no wrong calculation.
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

const S = h.state;
const D = h.deps;
const F = S.geometryFactories;

function freshState(objects = []) {
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
    scale: { mmPerUnit: 1, unit: "mm" },
    version: 1,
    units: "mm",
    grid: {},
    statics: {},
    snap: {},
    objectSnap: {},
    styleDefaults: {},
  };
}

console.log("\n== Build the full representative scene ==\n");

/* A 1000 mm beam. */
const beam = F.beam({ x: 0, y: 0 }, { x: 1000, y: 0 });

/* Pin at the start, roller at the end. */
const pin = F["pin-support"]({ x: 0, y: 0 });
pin.parentId = beam.id;
const roller = F["roller-support"]({ x: 1000, y: 0 });
roller.parentId = beam.id;

/* A point force at 250, a distributed load 400-700, a moment at 800. */
const force = F.force({ x: 250, y: 0 }, { x: 250, y: -100 });
force.parentId = beam.id;
force.geometry.magnitude = 100;
force.geometry.angle = -90;
force.geometry.unit = "N";

const load = F.load({ x: 400, y: 0 }, { x: 700, y: 0 }, 5);
load.parentId = beam.id;

const moment = F.moment({ x: 800, y: 0 }, 25, "CW");
moment.parentId = beam.id;

/* An SFD read against the beam. */
const sfd = F["analysis-diagram"]({ x: 0, y: -200 }, { x: 1000, y: -200 });
sfd.geometry.diagramType = "sfd";
sfd.geometry.mode = "plot";
D.registerDependency(sfd, [beam.id]);

/* A resultant of two separate forces. */
const a = F.force({ x: 0, y: 0 }, { x: 100, y: 0 });
a.geometry.magnitude = 100;
a.geometry.angle = 0;
const b = F.force({ x: 0, y: 0 }, { x: 0, y: 100 });
b.geometry.magnitude = 100;
b.geometry.angle = 90;

const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
D.registerDependency(resultant, [a.id, b.id]);

const scene = [beam, pin, roller, force, load, moment, sfd, a, b, resultant];
const state = freshState(scene);
D.refreshAll(state);

check(
  "the scene has every object",
  state.objects.length === 10,
  `got ${state.objects.length}`,
);

check(
  "the SFD domain is the beam's length",
  Math.abs(sfd.geometry.localRange.to - 1000) < 1e-6,
  JSON.stringify(sfd.geometry.localRange),
);

check(
  "the resultant of two 100 N forces is 141.42 N",
  Math.abs(resultant.geometry.magnitude - Math.SQRT2 * 100) < 0.5,
  `got ${resultant.geometry.magnitude}`,
);

console.log("\n== Move the beam: every child follows ==\n");

{
  const snapshot = JSON.parse(JSON.stringify(state.objects));

  beam.geometry.start = { x: 2000, y: 500 };
  beam.geometry.end = { x: 3000, y: 500 };

  S.commitDrawingChange(state, snapshot);

  const frame = h.frames.frameOf(beam);

  check(
    "the beam's frame follows it",
    Math.abs(frame.start.x - 2000) < 1e-6 &&
      Math.abs(frame.start.y - 500) < 1e-6,
    JSON.stringify(frame.start),
  );
  check(
    "its length is unchanged at 1000",
    Math.abs(frame.length - 1000) < 1e-6,
    `got ${frame.length}`,
  );
  check(
    "the SFD domain is still the beam's length",
    Math.abs(sfd.geometry.localRange.to - 1000) < 1e-6,
    JSON.stringify(sfd.geometry.localRange),
  );
  check(
    "the supports still name the beam",
    pin.parentId === beam.id && roller.parentId === beam.id,
  );
}

console.log("\n== Lengthen the beam: the analysis domain follows ==\n");

{
  const snapshot = JSON.parse(JSON.stringify(state.objects));

  beam.geometry.end = { x: 3500, y: 500 };
  S.commitDrawingChange(state, snapshot);

  check(
    "the domain is now 1500",
    Math.abs(sfd.geometry.localRange.to - 1500) < 1e-6,
    JSON.stringify(sfd.geometry.localRange),
  );
  check(
    "and the frame is 1500 long",
    Math.abs(h.frames.frameOf(beam).length - 1500) < 1e-6,
  );
}

console.log("\n== Change a force magnitude: the resultant follows ==\n");

{
  const snapshot = JSON.parse(JSON.stringify(state.objects));

  a.geometry.magnitude = 300;
  a.geometry.end = { x: 300, y: 0 };
  S.commitDrawingChange(state, snapshot);

  check(
    "the resultant recomputes",
    Math.abs(resultant.geometry.magnitude - Math.hypot(300, 100)) < 0.5,
    `got ${resultant.geometry.magnitude}, expected ${Math.hypot(300, 100).toFixed(2)}`,
  );
}

console.log("\n== Reverse the point force: only its direction changes ==\n");

{
  const before = {
    magnitude: force.geometry.magnitude,
    start: { ...force.geometry.start },
    end: { ...force.geometry.end },
  };

  h.profile.reverseForceDirection(force.geometry);

  check(
    "the magnitude is unchanged",
    force.geometry.magnitude === before.magnitude,
    `${before.magnitude} -> ${force.geometry.magnitude}`,
  );
  check(
    "the application point is unchanged",
    force.geometry.start.x === before.start.x &&
      force.geometry.start.y === before.start.y,
  );
  check(
    "the drawn span is unchanged",
    force.geometry.end.x === before.end.x &&
      force.geometry.end.y === before.end.y,
  );
}

console.log("\n== Reverse the load: span and intensity unchanged ==\n");

{
  const before = {
    intensity: load.geometry.intensity,
    start: { ...load.geometry.start },
    end: { ...load.geometry.end },
  };

  h.profile.reverseLoadDirection(load.geometry);

  check(
    "the intensity is unchanged",
    load.geometry.intensity === before.intensity,
  );
  check(
    "the span is unchanged",
    load.geometry.start.x === before.start.x &&
      load.geometry.end.x === before.end.x,
  );
  check(
    "and the reversal is recorded",
    h.profile.isLoadReversed(load.geometry) === true,
  );
}

console.log("\n== Move the moment: magnitude and direction unchanged ==\n");

{
  const before = {
    magnitude: moment.geometry.magnitude,
    direction: moment.geometry.direction,
  };

  moment.geometry.position = { x: 900, y: 0 };

  check(
    "the magnitude is unchanged",
    moment.geometry.magnitude === before.magnitude,
  );
  check(
    "the direction is unchanged",
    moment.geometry.direction === before.direction,
  );
}

console.log("\n== Delete the beam: children go, independent forces stay ==\n");

{
  const state2 = freshState(JSON.parse(JSON.stringify(state.objects)));

  S.removeObjectsAndDescendants(state2, [beam.id]);

  const remaining = state2.objects.map((o) => o.type);

  check(
    "the supports are gone",
    !remaining.includes("pin-support") && !remaining.includes("roller-support"),
    remaining.join(", "),
  );
  check(
    "the load and moment are gone",
    !remaining.includes("load") && !remaining.includes("moment"),
    remaining.join(", "),
  );
  check(
    "the independent forces survive",
    remaining.includes("force"),
    remaining.join(", "),
  );
  check(
    "the resultant survives",
    remaining.includes("resultant"),
    remaining.join(", "),
  );
}

console.log("\n== Save and reload the whole scene ==\n");

{
  const payload = S.serializeDrawing(state);
  const restored = JSON.parse(payload);

  const restoredState = freshState(restored.objects);
  D.refreshAll(restoredState);

  const restoredSfd = restoredState.objects.find(
    (o) => o.type === "analysis-diagram",
  );
  const restoredResultant = restoredState.objects.find(
    (o) => o.type === "resultant",
  );

  check(
    "the object count is preserved",
    restored.objects.length === state.objects.length,
    `${restored.objects.length} of ${state.objects.length}`,
  );
  check(
    "the SFD domain survives",
    Math.abs(restoredSfd.geometry.localRange.to - 1500) < 1e-6,
    JSON.stringify(restoredSfd.geometry.localRange),
  );
  check(
    "the resultant magnitude survives",
    Math.abs(
      restoredResultant.geometry.magnitude - resultant.geometry.magnitude,
    ) < 1e-6,
  );
  check(
    "the parent links survive",
    restoredState.objects.filter((o) => o.parentId === beam.id).length ===
      state.objects.filter((o) => o.parentId === beam.id).length,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
