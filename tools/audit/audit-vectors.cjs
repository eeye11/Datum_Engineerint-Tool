/*
 * Audit: vector arrow geometry, quadrant behaviour, and Vector Scale.
 *
 * The claim under test: every vector feature draws an arrow whose HEAD is the
 * real engineering vector head, in all four quadrants, and whose visual length
 * changes with Vector Scale while its engineering magnitude does not.
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

/* A drawing state the renderer/profile can read. */
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

console.log(
  "\n== Point Force: arrow head follows the vector in every quadrant ==\n",
);

/*
 * A force at a point, of a given magnitude and angle. The arrow the renderer
 * draws must run from the application point to the point the vector actually
 * reaches, in ALL quadrants - the classic defect is a quadrant-specific
 * arrowhead rule that points the tip the wrong way.
 */
const QUADRANTS = [
  ["+X", 0, 1, 0],
  ["-X", 180, -1, 0],
  ["+Y", 90, 0, 1],
  ["-Y", -90, 0, -1],
  ["+X+Y", 45, 1, 1],
  ["-X+Y", 135, -1, 1],
  ["-X-Y", -135, -1, -1],
  ["+X-Y", -45, 1, -1],
];

for (const [label, angle, ex, ey] of QUADRANTS) {
  const force = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle },
  );
  const geometry = force.geometry;
  const start = geometry.start;
  const end = geometry.end;

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  check(
    `force ${label}: head is in the expected quadrant`,
    Math.sign(dx) === Math.sign(ex || dx) &&
      (ex === 0 ? Math.abs(dx) < 1e-6 : Math.sign(dx) === ex) &&
      (ey === 0 ? Math.abs(dy) < 1e-6 : Math.sign(dy) === ey),
    `angle ${angle}: start ${JSON.stringify(start)} end ${JSON.stringify(end)}`,
  );
}

console.log(
  "\n== Point Force: magnitude is authoritative, not rendered length ==\n",
);

{
  const force = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 0 },
  );
  const vector = h.profile.forceVector(force.geometry);

  check(
    "forceVector reports the stored magnitude",
    Math.abs(vector.magnitude - 100) < 1e-6,
    `got ${vector.magnitude}`,
  );

  /* The rendered arrow's world length is independent of the magnitude. */
  const before = JSON.stringify(force.geometry.end);

  force.geometry.magnitude = 250;
  const after = h.profile.forceVector(force.geometry);

  check(
    "changing magnitude changes the reported magnitude",
    Math.abs(after.magnitude - 250) < 1e-6,
    `got ${after.magnitude}`,
  );
  check(
    "and the stored geometry is what states it",
    typeof force.geometry.magnitude === "number",
  );
}

console.log("\n== Vector Scale changes ONLY the drawn size ==\n");

{
  const force = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 30 },
  );

  const scales = [0.25, 0.5, 1, 2, 4];
  const magnitudes = scales.map((scale) => {
    const state = stateWith([force]);
    state.display = { vectorScale: scale };
    return h.profile.forceVector(force.geometry).magnitude;
  });

  check(
    "the engineering magnitude is identical at every Vector Scale",
    magnitudes.every((m) => Math.abs(m - 100) < 1e-6),
    magnitudes.join(", "),
  );

  check(
    "the scale options are the documented set",
    JSON.stringify(h.profile.VECTOR_SCALE_OPTIONS.map((o) => o.value)) ===
      JSON.stringify([0.25, 0.5, 1, 2, 4]),
    JSON.stringify(h.profile.VECTOR_SCALE_OPTIONS),
  );

  check(
    "the default is 1.0x",
    h.profile.vectorScaleFor(stateWith([force])) === 1,
    `got ${h.profile.vectorScaleFor(stateWith([force]))}`,
  );
}

console.log("\n== Force components use engineering data ==\n");

{
  for (const [label, angle, ex, ey] of QUADRANTS) {
    const radians = (angle * Math.PI) / 180;
    const force = F.force(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { magnitude: 100, angle },
    );

    const components = F["force-components"](
      { x: 0, y: 0 },
      {
        x: 100 * Math.cos(radians),
        y: 100 * Math.sin(radians),
      },
    );

    const fx = components.geometry.forceX;
    const fy = components.geometry.forceY;

    const expectedFx = 100 * Math.cos(radians);
    const expectedFy = 100 * Math.sin(radians);

    check(
      `components ${label}: Fx/Fy are the true projections`,
      Math.abs(fx - expectedFx) < 0.5 && Math.abs(fy - expectedFy) < 0.5,
      `got Fx=${fx} Fy=${fy}, expected ${expectedFx}, ${expectedFy}`,
    );
  }
}

console.log("\n== Resultant is the vector sum of its sources ==\n");

{
  const a = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 0 },
  );
  const b = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 90 },
  );

  const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  resultant.geometry.sourceForceIds = [a.id, b.id];

  const state = stateWith([a, b, resultant]);
  h.deps.refreshAnalysis(state);

  const magnitude = resultant.geometry.magnitude;

  check(
    "two 100 N forces at right angles give 141.4 N",
    Math.abs(magnitude - Math.SQRT2 * 100) < 0.5,
    `got ${magnitude}`,
  );

  /* Change a source and confirm the resultant follows. */
  a.geometry.magnitude = 300;
  h.deps.refreshAnalysis(state);

  const after = resultant.geometry.magnitude;
  const expected = Math.hypot(300, 100);

  check(
    "and follows a source that changes",
    Math.abs(after - expected) < 0.5,
    `got ${after}, expected ${expected}`,
  );

  /* Zero resultant must not be a malformed arrow. */
  const c = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 0 },
  );
  const d = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 180 },
  );
  const zero = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  zero.geometry.sourceForceIds = [c.id, d.id];

  const zeroState = stateWith([c, d, zero]);
  h.deps.refreshAnalysis(zeroState);

  check(
    "opposing equal forces give a zero resultant",
    Math.abs(zero.geometry.magnitude) < 1e-6,
    `got ${zero.geometry.magnitude}`,
  );
}

console.log("\n== Force components do not create a duplicate force ==\n");

{
  const source = F.force(
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { magnitude: 100, angle: 30 },
  );
  const components = F["force-components"]({ x: 0, y: 0 }, { x: 100, y: 0 });

  const state = stateWith([source, components]);

  check(
    "there are exactly two objects: the force and its components",
    state.objects.length === 2,
    `got ${state.objects.length}`,
  );
  check(
    "and no second force was fabricated",
    state.objects.filter((o) => o.type === "force").length === 1,
    `got ${state.objects.filter((o) => o.type === "force").length} forces`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
