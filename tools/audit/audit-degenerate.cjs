/*
 * Audit: degenerate and extreme values, and the Vector Scale option set.
 *
 * The claim under test: a zero or invalid engineering value is handled as a
 * real state rather than producing a malformed arrow, and the Vector Scale set
 * is the one the specification names.
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

console.log("\n== Vector Scale: the option set ==\n");

const values = h.profile.VECTOR_SCALE_OPTIONS.map((o) => o.value);
const labels = h.profile.VECTOR_SCALE_OPTIONS.map((o) => o.label);

console.log("  implementation offers:", values.join(", "));

check(
  "1.0x is available",
  values.includes(1),
  values.join(", "),
);
check(
  "the specification's four multipliers are all present",
  [0.25, 0.5, 2, 4].every((v) => values.includes(v)),
  `missing: ${[0.25, 0.5, 2, 4].filter((v) => !values.includes(v)).join(", ")}`,
);
check(
  "the set is ordered ascending",
  values.every((v, i) => i === 0 || v > values[i - 1]),
  values.join(", "),
);

console.log("\n== Degenerate values do not produce malformed geometry ==\n");

{
  /* A zero-length force: application point and tip coincide. */
  const zero = F.force({ x: 0, y: 0 }, { x: 0, y: 0 });
  const vector = h.profile.forceVector(zero.geometry);

  check(
    "a zero-length force reports a zero magnitude, not NaN",
    Number.isFinite(vector.magnitude) && Math.abs(vector.magnitude) < 1e-9,
    `got ${vector.magnitude}`,
  );
  check(
    "and a finite direction",
    Number.isFinite(Number(vector.angle)),
    `got ${vector.angle}`,
  );
}

{
  /* A zero-length beam has no span, and must not claim one. */
  const beam = F.beam({ x: 5, y: 5 }, { x: 5, y: 5 });
  const span = h.deps.spanOf(beam);

  check(
    "a zero-length beam reports no span",
    span === null,
    `got ${JSON.stringify(span)}`,
  );
}

{
  /* A zero-intensity load is a real state, not an error. */
  const load = F.load({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);

  check(
    "a zero-intensity load stores zero, not nothing",
    Number(load.geometry.intensity) === 0,
    `got ${load.geometry.intensity}`,
  );
}

console.log("\n== Extreme but valid values stay finite ==\n");

{
  for (const magnitude of [0.1, 100, 10000]) {
    const radians = 0;
    const force = F.force(
      { x: 0, y: 0 },
      { x: magnitude * Math.cos(radians), y: magnitude * Math.sin(radians) },
    );
    const vector = h.profile.forceVector(force.geometry);

    check(
      `a ${magnitude} N force stays finite and exact`,
      Number.isFinite(vector.magnitude) &&
        Math.abs(vector.magnitude - magnitude) < 1e-6,
      `got ${vector.magnitude}`,
    );
  }

  for (const length of [0.1, 500, 5000]) {
    const beam = F.beam({ x: 0, y: 0 }, { x: length, y: 0 });
    const span = h.deps.spanOf(beam);

    check(
      `a ${length} mm beam reports its exact length`,
      span && Math.abs(span.length - length) < 1e-6,
      `got ${span && span.length}`,
    );
  }
}

console.log("\n== Units are carried on the feature, not assumed ==\n");

{
  const force = F.force({ x: 0, y: 0 }, { x: 100, y: 0 });
  const moment = F.moment({ x: 0, y: 0 }, 25, "CW");

  check(
    "a moment carries its engineering unit",
    String(moment.geometry.unit).includes("N"),
    `got ${moment.geometry.unit}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);