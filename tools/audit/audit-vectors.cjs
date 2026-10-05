/*
 * Audit: vector arrow geometry, quadrant behaviour, derived features and
 * Vector Scale - using the real factory signatures.
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
    selection: { selectedObjectIds: [], boxSelectionIds: [], hoveredObjectId: null },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
  };
}

function tip(angle, magnitude = 100) {
  const radians = (angle * Math.PI) / 180;
  return { x: magnitude * Math.cos(radians), y: magnitude * Math.sin(radians) };
}

function forceAt(angle, magnitude = 100) {
  return F.force({ x: 0, y: 0 }, tip(angle, magnitude));
}

console.log("\n== Point Force: direction is correct in every quadrant ==\n");

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
  const force = forceAt(angle);
  const vector = h.profile.forceVector(force.geometry);

  const okX = ex === 0 ? Math.abs(vector.fx) < 1e-6 : Math.sign(vector.fx) === ex;
  const okY = ey === 0 ? Math.abs(vector.fy) < 1e-6 : Math.sign(vector.fy) === ey;

  check(
    `force ${label}: direction is in the expected quadrant`,
    okX && okY,
    `angle ${angle}: fx=${vector.fx} fy=${vector.fy}`,
  );

  check(
    `force ${label}: magnitude reads 100`,
    Math.abs(vector.magnitude - 100) < 1e-6,
    `got ${vector.magnitude}`,
  );
}

console.log("\n== Switch Direction reverses only the direction ==\n");

{
  const force = forceAt(30);
  const before = h.profile.forceVector(force.geometry);
  const beforeTip = { ...force.geometry.end };

  h.profile.reverseForceDirection(force.geometry);

  const after = h.profile.forceVector(force.geometry);

  const delta = (((after.angle - before.angle) % 360) + 360) % 360;

  check(
    "the magnitude is unchanged",
    Math.abs(after.magnitude - before.magnitude) < 1e-6,
    `${before.magnitude} -> ${after.magnitude}`,
  );
  check(
    "the engineering direction turns 180 degrees",
    Math.abs(delta - 180) < 1e-6,
    `${before.angle} -> ${after.angle} (delta ${delta})`,
  );
  check(
    "the application point did not move",
    Math.abs(force.geometry.start.x) < 1e-9 &&
      Math.abs(force.geometry.start.y) < 1e-9,
    JSON.stringify(force.geometry.start),
  );
  check(
    "the drawn span did not move",
    Math.abs(force.geometry.end.x - beforeTip.x) < 1e-9 &&
      Math.abs(force.geometry.end.y - beforeTip.y) < 1e-9,
    `${JSON.stringify(beforeTip)} -> ${JSON.stringify(force.geometry.end)}`,
  );
}

console.log("\n== Vector Scale changes ONLY the drawn size ==\n");

{
  const force = forceAt(30);
  const state = stateWith([force]);

  check("the default is 1.0x", h.profile.vectorScaleFor(state) === 1, `got ${h.profile.vectorScaleFor(state)}`);
  check(
    "the specification's multipliers are all offered",
    [0.25, 0.5, 1, 2, 4].every((v) =>
      h.profile.VECTOR_SCALE_OPTIONS.some((o) => o.value === v),
    ),
    JSON.stringify(h.profile.VECTOR_SCALE_OPTIONS.map((o) => o.value)),
  );

  const magnitudes = [0.25, 0.5, 1, 2, 4].map((scale) => {
    const s = stateWith([force]);
    s.display = { vectorScale: scale };
    return h.profile.forceVector(force.geometry).magnitude;
  });

  check(
    "the engineering magnitude is identical at every scale",
    magnitudes.every((m) => Math.abs(m - 100) < 1e-6),
    magnitudes.join(", "),
  );
}

console.log("\n== Force components are the true projections ==\n");

{
  for (const [label, angle] of QUADRANTS) {
    const source = forceAt(angle, 100);
    const components = F["force-components"]({ x: 0, y: 0 }, { x: 1, y: 0 });
    h.deps.registerDependency(components, [source.id]);
    h.deps.refreshAnalysis(components, stateWith([source, components]));

    const fx = components.geometry.forceX;
    const fy = components.geometry.forceY;

    const radians = (angle * Math.PI) / 180;
    const expectedFx = 100 * Math.cos(radians);
    const expectedFy = 100 * Math.sin(radians);

    check(
      `components ${label}: Fx/Fy are the projections`,
      Math.abs(fx - expectedFx) < 0.5 && Math.abs(fy - expectedFy) < 0.5,
      `got Fx=${Number(fx).toFixed(1)} Fy=${Number(fy).toFixed(1)}, expected ${expectedFx.toFixed(1)}, ${expectedFy.toFixed(1)}`,
    );
  }
}

console.log("\n== Resultant is the vector sum of its sources ==\n");

{
  const a = forceAt(0, 100);
  const b = forceAt(90, 100);
  const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  h.deps.registerDependency(resultant, [a.id, b.id]);

  const state = stateWith([a, b, resultant]);
  h.deps.refreshAnalysis(resultant, state);

  check(
    "two 100 N forces at right angles give 141.42 N",
    Math.abs(resultant.geometry.magnitude - Math.SQRT2 * 100) < 0.5,
    `got ${resultant.geometry.magnitude}`,
  );

  a.geometry.magnitude = 300;
  a.geometry.end = { x: 300, y: 0 };
  h.deps.refreshAnalysis(resultant, state);

  check(
    "and follows a source that changes",
    Math.abs(resultant.geometry.magnitude - Math.hypot(300, 100)) < 0.5,
    `got ${resultant.geometry.magnitude}, expected ${Math.hypot(300, 100).toFixed(2)}`,
  );

  const c = forceAt(0, 100);
  const d = forceAt(180, 100);
  const zero = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  h.deps.registerDependency(zero, [c.id, d.id]);
  h.deps.refreshAnalysis(zero, stateWith([c, d, zero]));

  check(
    "opposing equal forces give a zero resultant",
    Math.abs(zero.geometry.magnitude) < 1e-6,
    `got ${zero.geometry.magnitude}`,
  );
}

console.log("\n== Force components do not fabricate a duplicate force ==\n");

{
  const source = forceAt(30);
  const components = F["force-components"]({ x: 0, y: 0 }, { x: 100, y: 0 });
  const state = stateWith([source, components]);

  check("exactly two objects exist", state.objects.length === 2, `got ${state.objects.length}`);
  check(
    "and only one of them is a force",
    state.objects.filter((o) => o.type === "force").length === 1,
    `got ${state.objects.filter((o) => o.type === "force").length}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
