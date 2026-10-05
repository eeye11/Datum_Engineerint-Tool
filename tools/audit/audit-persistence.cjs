/*
 * Audit: save / reload round trip for a full Statics scene.
 *
 * The claim under test: after serialising and restoring, every relationship
 * (parentId, engineering.sourceFeatureIds, dimension sourceRefs) is intact and
 * every derived feature recomputes to the same engineering value.
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
    scale: null,
    version: 1,
    units: "mm",
    grid: {},
    statics: {},
    snap: {},
    objectSnap: {},
    styleDefaults: {},
  };
}

function forceAt(id, angle, magnitude = 100) {
  const radians = (angle * Math.PI) / 180;
  const force = F.force(
    { x: 0, y: 0 },
    { x: magnitude * Math.cos(radians), y: magnitude * Math.sin(radians) },
  );
  force.id = id;
  return force;
}

console.log("\n== A full scene round-trips through save and reload ==\n");

const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
const support = F["pin-support"]({ x: 0, y: 0 });
support.parentId = beam.id;
const roller = F["roller-support"]({ x: 600, y: 0 });
roller.parentId = beam.id;

const load = F.load({ x: 100, y: 0 }, { x: 400, y: 0 }, 5);
load.parentId = beam.id;

const varying = F["varying-load"]({ x: 400, y: 0 }, { x: 600, y: 0 }, 5, 10);
varying.parentId = beam.id;

const moment = F.moment({ x: 300, y: 0 }, 25, "CW");
moment.parentId = beam.id;

const a = forceAt("force-a", 0, 100);
const b = forceAt("force-b", 90, 100);

const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
D.registerDependency(resultant, [a.id, b.id]);

const components = F["force-components"]({ x: 0, y: 0 }, { x: 1, y: 0 });
D.registerDependency(components, [a.id]);

const scene = [
  beam,
  support,
  roller,
  load,
  varying,
  moment,
  a,
  b,
  resultant,
  components,
];

const state = freshState(scene);
D.refreshAll(state);

const before = {
  resultantMagnitude: resultant.geometry.magnitude,
  componentFx: components.geometry.forceX,
  componentFy: components.geometry.forceY,
};

const payload = S.serializeDrawing(state);
const restored = JSON.parse(payload);

check(
  "the payload is valid JSON",
  typeof payload === "string" && payload.length > 0,
);
check(
  "every object survives the round trip",
  restored.objects.length === scene.length,
  `${restored.objects.length} of ${scene.length}`,
);

const restoredState = freshState([]);
restoredState.objects = restored.objects;

/* Re-derive against the restored scene. */
D.refreshAll(restoredState);

const restoredResultant = restoredState.objects.find(
  (o) => o.type === "resultant",
);
const restoredComponents = restoredState.objects.find(
  (o) => o.type === "force-components",
);

check(
  "the resultant still names its two sources",
  JSON.stringify(D.sourceIdsOf(restoredResultant)) ===
    JSON.stringify([a.id, b.id]),
  JSON.stringify(D.sourceIdsOf(restoredResultant)),
);

check(
  "and recomputes to the same magnitude",
  Math.abs(restoredResultant.geometry.magnitude - before.resultantMagnitude) <
    1e-6,
  `${before.resultantMagnitude} -> ${restoredResultant.geometry.magnitude}`,
);

check(
  "the components recompute to the same projections",
  Math.abs(restoredComponents.geometry.forceX - before.componentFx) < 1e-6 &&
    Math.abs(restoredComponents.geometry.forceY - before.componentFy) < 1e-6,
  `${JSON.stringify(before)} -> ${JSON.stringify({
    fx: restoredComponents.geometry.forceX,
    fy: restoredComponents.geometry.forceY,
  })}`,
);

console.log("\n== Parent relationships survive the round trip ==\n");

{
  const restoredSupport = restoredState.objects.find(
    (o) => o.type === "pin-support",
  );
  const restoredBeam = restoredState.objects.find((o) => o.type === "beam");

  check(
    "the support still names its beam",
    restoredSupport.parentId === restoredBeam.id,
    `${restoredSupport.parentId} vs ${restoredBeam.id}`,
  );

  const restoredLoad = restoredState.objects.find((o) => o.type === "load");
  check(
    "the load still names its beam",
    restoredLoad.parentId === restoredBeam.id,
    `${restoredLoad.parentId} vs ${restoredBeam.id}`,
  );
}

console.log("\n== Editing a restored feature still propagates ==\n");

{
  const restoredBeam = restoredState.objects.find((o) => o.type === "beam");
  const restoredResultant = restoredState.objects.find(
    (o) => o.type === "resultant",
  );

  /* Move a restored source force and confirm the restored resultant follows. */
  const restoredA = restoredState.objects.find((o) => o.id === "force-a");
  restoredA.geometry.magnitude = 300;
  restoredA.geometry.end = { x: 300, y: 0 };

  D.refreshAnalysis(restoredResultant, restoredState);

  check(
    "the restored resultant follows an edited restored source",
    Math.abs(restoredResultant.geometry.magnitude - Math.hypot(300, 100)) < 0.5,
    `got ${restoredResultant.geometry.magnitude}`,
  );

  /* And the parent/child link still works after reload. */
  const restoredSupport = restoredState.objects.find(
    (o) => o.type === "pin-support",
  );
  const frame = h.frames.frameOf(restoredBeam);

  check(
    "and the support's body frame is still derivable",
    frame && Math.abs(frame.length - 600) < 1e-6,
    `length ${frame && frame.length}`,
  );
}

console.log("\n== Deleting a restored parent cleans up its children ==\n");

{
  const restoredBeam = restoredState.objects.find((o) => o.type === "beam");

  S.removeObjectsAndDescendants(restoredState, [restoredBeam.id]);

  check(
    "the restored beam and its children are gone",
    !restoredState.objects.some(
      (o) => o.parentId === restoredBeam.id || o.id === restoredBeam.id,
    ),
    `remaining: ${restoredState.objects.map((o) => o.type).join(", ")}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
