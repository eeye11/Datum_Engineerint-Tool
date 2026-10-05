/*
 * Audit: magnitude annotations - the source owns the engineering value, the
 * annotation owns only its display position and visibility.
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

const A = h.annotations;
const F = h.state.geometryFactories;

function stateWith(objects) {
  return {
    objects,
    selection: { selectedObjectIds: [], boxSelectionIds: [], hoveredObjectId: null },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
    scale: { mmPerUnit: 1, unit: "mm" },
  };
}

console.log("\n== A magnitude annotation reads its source, and carries a unit ==\n");

{
  const force = F.force({ x: 0, y: 0 }, { x: 0, y: -100 });
  force.geometry.magnitude = 250;
  force.geometry.angle = -90;
  force.geometry.unit = "N";

  const annotation = F.annotation({
    kind: "force-value",
    sourceFeatureId: force.id,
    position: { x: 10, y: 10 },
  });

  const state = stateWith([force, annotation]);
  const text = A.textFor(annotation, state);

  check("the annotation has text", Boolean(text), `got ${JSON.stringify(text)}`);
  check(
    "the text carries the engineering unit",
    /\bN\b/.test(String(text)),
    `got ${JSON.stringify(text)}`,
  );
  check(
    "and no approximation symbol",
    !String(text).includes("~"),
    `got ${JSON.stringify(text)}`,
  );
  check(
    "and no NaN or undefined",
    !/NaN|undefined/.test(String(text)),
    `got ${JSON.stringify(text)}`,
  );
}

console.log("\n== The annotation follows a source edit ==\n");

{
  const force = F.force({ x: 0, y: 0 }, { x: 0, y: -100 });
  force.geometry.magnitude = 250;
  force.geometry.angle = -90;
  force.geometry.unit = "N";

  const annotation = F.annotation({
    kind: "force-value",
    sourceFeatureId: force.id,
    position: { x: 10, y: 10 },
  });

  const state = stateWith([force, annotation]);
  const before = A.textFor(annotation, state);

  force.geometry.magnitude = 500;
  const after = A.textFor(annotation, state);

  check(
    "the annotation text changes with the source magnitude",
    before !== after,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
  );
  check(
    "and still carries the unit",
    /\bN\b/.test(String(after)),
    `got ${JSON.stringify(after)}`,
  );
}

console.log("\n== The annotation does NOT own the engineering value ==\n");

{
  const force = F.force({ x: 0, y: 0 }, { x: 0, y: -100 });
  force.geometry.magnitude = 250;
  force.geometry.angle = -90;
  force.geometry.unit = "N";

  const annotation = F.annotation({
    kind: "force-value",
    sourceFeatureId: force.id,
    position: { x: 10, y: 10 },
  });

  check(
    "the annotation records the source feature id",
    annotation.sourceFeatureId === force.id,
    `got ${annotation.sourceFeatureId}`,
  );
  check(
    "and stores its own display position",
    JSON.stringify(annotation.placement) === JSON.stringify({ x: 10, y: 10 }),
    JSON.stringify(annotation.placement),
  );
  check(
    "the source holds the magnitude, not the annotation",
    force.geometry.magnitude === 250 &&
      annotation.geometry?.magnitude === undefined,
    `force=${force.geometry.magnitude} annotation=${annotation.geometry?.magnitude}`,
  );

  /* Moving the annotation must not touch the source. */
  annotation.placement = { x: 200, y: 200 };
  check(
    "moving the annotation leaves the source magnitude alone",
    force.geometry.magnitude === 250,
    `got ${force.geometry.magnitude}`,
  );
}

console.log("\n== Deleting the source leaves the annotation explicitly unresolved ==\n");

{
  const force = F.force({ x: 0, y: 0 }, { x: 0, y: -100 });
  force.geometry.magnitude = 250;
  force.geometry.angle = -90;
  force.geometry.unit = "N";

  const annotation = F.annotation({
    kind: "force-value",
    sourceFeatureId: force.id,
    position: { x: 10, y: 10 },
  });

  const state = stateWith([annotation]);

  check(
    "the annotation reports its source as unresolved",
    A.isResolved(annotation, state) === false,
    `resolved=${A.isResolved(annotation, state)}`,
  );
}

console.log("\n== A moment annotation carries a moment unit ==\n");

{
  const moment = F.moment({ x: 0, y: 0 }, 25, "CW");
  const annotation = F.annotation({
    kind: "moment-value",
    sourceFeatureId: moment.id,
    position: { x: 10, y: 10 },
  });

  const state = stateWith([moment, annotation]);
  const text = A.textFor(annotation, state);

  check(
    "the moment annotation reads a value with its unit",
    Boolean(text) && !/NaN|undefined/.test(String(text)) && !String(text).includes("~"),
    `got ${JSON.stringify(text)}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);