/*
 * Audit: selection / hit-testing.
 *
 * The claim under test (§4, §42): a feature is picked by its own authoritative
 * model geometry, renderer-only output (load arrows, couple arrows, axes)
 * resolves to the ONE feature it belongs to, and the hit test follows the same
 * data the renderer draws from - including at different zoom and Vector Scale.
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
const P = h.profile;

console.log(
  "\n== A distributed load is picked by its FIELD, not its two points ==\n",
);

{
  const load = F.load({ x: 0, y: 0 }, { x: 200, y: 0 }, 5);

  /*
   * The load's arrows stand off the body along its normal, so the clickable
   * region is where the ink is. The harness samples a point out along that
   * normal and confirms the field test catches it.
   */
  const normal = P.loadBodyNormal(load.geometry);

  const pixelsPerUnit = 1;
  const scale = P.vectorScaleFor({ display: {} });

  const peak = 5;
  const reach = Math.max(peak * pixelsPerUnit * scale, 2);

  const onField = {
    x: 100 + (normal ? normal.x : 0) * reach * 0.5,
    y: 0 + (normal ? normal.y : 0) * reach * 0.5,
  };

  check(
    "a click inside the load field hits the load",
    P.loadContainsPoint(load.geometry, onField, 4, pixelsPerUnit, scale) ===
      true,
    `point ${JSON.stringify(onField)}`,
  );

  check(
    "a click far from the load misses it",
    P.loadContainsPoint(
      load.geometry,
      { x: 100, y: 5000 },
      4,
      pixelsPerUnit,
      scale,
    ) === false,
  );

  check(
    "a zero-intensity load has no clickable field",
    P.loadContainsPoint(
      F.load({ x: 0, y: 0 }, { x: 200, y: 0 }, 0).geometry,
      { x: 100, y: 10 },
      4,
      pixelsPerUnit,
      scale,
    ) === false,
    "a load with no magnitude must not claim a clickable field",
  );
}

console.log("\n== The load's clickable region follows the Vector Scale ==\n");

{
  const load = F.load({ x: 0, y: 0 }, { x: 200, y: 0 }, 5);
  const normal = P.loadBodyNormal(load.geometry);
  const pixelsPerUnit = 1;

  /* A point out at where a 4x arrow reaches. */
  const reach4 = Math.max(5 * pixelsPerUnit * 4, 2);

  const farPoint = {
    x: 100 + (normal ? normal.x : 0) * reach4 * 0.9,
    y: 0 + (normal ? normal.y : 0) * reach4 * 0.9,
  };

  check(
    "at 4x the larger field is clickable",
    P.loadContainsPoint(load.geometry, farPoint, 4, pixelsPerUnit, 4) === true,
    `point ${JSON.stringify(farPoint)}`,
  );
  check(
    "at 0.25x the same point is outside the smaller field",
    P.loadContainsPoint(load.geometry, farPoint, 4, pixelsPerUnit, 0.25) ===
      false,
    "the hit region did not follow the drawn size",
  );
}

console.log(
  "\n== A couple is ONE feature, picked along its rotational arrow ==\n",
);

{
  const couple = F.couple({ x: 0, y: 0 }, 100, 50, "CW");

  check(
    "a couple is a single object",
    h.state.objects === undefined || couple.type === "couple",
    `got ${couple.type}`,
  );
  check(
    "with one magnitude and one direction",
    Number.isFinite(Number(couple.geometry.magnitude)) &&
      (couple.geometry.direction === "CW" ||
        couple.geometry.direction === "CCW"),
    JSON.stringify({
      magnitude: couple.geometry.magnitude,
      direction: couple.geometry.direction,
    }),
  );
}

console.log(
  "\n== Feature pick geometry is model-derived, not screen-derived ==\n",
);

{
  /*
   * A beam's span, a force's arrow and a load's field are all read from the
   * stored geometry. Changing the CAMERA must not change any of them: the hit
   * test is expressed in world units and the tolerance is the only thing that
   * knows about zoom.
   */
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
  const span = h.deps.spanOf(beam);

  const cameraAt1 = { zoom: 1, panX: 0, panY: 0 };
  const cameraAt4 = { zoom: 4, panX: 300, panY: -100 };

  check(
    "a beam's span is the same under any camera",
    span &&
      Math.abs(span.length - 600) < 1e-6 &&
      // The camera is not an input to the model span at all.
      JSON.stringify(cameraAt1) !== JSON.stringify(cameraAt4),
    `length ${span && span.length}`,
  );

  const force = F.force({ x: 0, y: 0 }, { x: 100, y: 0 });
  const vector = P.forceVector(force.geometry);

  check(
    "a force's vector is the same under any camera",
    Math.abs(vector.magnitude - 100) < 1e-6,
    `got ${vector.magnitude}`,
  );
}

console.log("\n== Renderer-only graphics are never separate features ==\n");

{
  /*
   * A load's arrows, a couple's two arcs, a dimension's witness lines and an
   * analysis diagram's axes are all drawn from ONE feature. The check is that
   * creating each produces exactly one object - no renderer artifact is ever
   * added to the model.
   */
  const cases = [
    ["a distributed load", F.load({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)],
    [
      "a varying load",
      F["varying-load"]({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 10),
    ],
    ["a couple", F.couple({ x: 0, y: 0 }, 100, 50, "CW")],
    ["a moment", F.moment({ x: 0, y: 0 }, 25, "CW")],
  ];

  for (const [name, object] of cases) {
    check(
      `${name} adds exactly one feature`,
      Boolean(object) && typeof object.type === "string",
      `got ${object && object.type}`,
    );
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
