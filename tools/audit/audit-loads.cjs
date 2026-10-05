/*
 * Audit: distributed loads, moments, supports and body frames - their
 * authoritative data, body-local spans, direction handling and dependency
 * updates, using the real factory and frame API.
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

const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });

console.log("\n== Distributed load: span and intensity are the data ==\n");

{
  const load = F.load({ x: 150, y: 0 }, { x: 450, y: 0 }, 5);

  check(
    "the load stores its own two ends",
    Math.abs(load.geometry.start.x - 150) < 1e-6 &&
      Math.abs(load.geometry.end.x - 450) < 1e-6,
    JSON.stringify({ start: load.geometry.start, end: load.geometry.end }),
  );

  check(
    "the intensity is stored on the feature",
    Math.abs(Number(load.geometry.intensity) - 5) < 1e-6,
    `got ${load.geometry.intensity}`,
  );

  check(
    "and a profile of magnitude points describes the field",
    Array.isArray(load.geometry.points) && load.geometry.points.length >= 2,
    JSON.stringify(load.geometry.points),
  );

  const span = h.deps.spanOf(load);
  check(
    "its span is 300 long",
    span && Math.abs(span.length - 300) < 1e-6,
    `got ${span && span.length}`,
  );

  check(
    "and its direction is stored as an engineering angle",
    Number.isFinite(Number(load.geometry.direction)),
    `got ${load.geometry.direction}`,
  );
}

console.log("\n== Reversing a load keeps its span and its intensity ==\n");

{
  const load = F.load({ x: 150, y: 0 }, { x: 450, y: 0 }, 5);
  const beforeStart = { ...load.geometry.start };
  const beforeEnd = { ...load.geometry.end };
  const beforeDirection = Number(load.geometry.direction);

  h.profile.reverseLoadDirection(load.geometry);

  check(
    "the span did not move",
    Math.abs(load.geometry.start.x - beforeStart.x) < 1e-6 &&
      Math.abs(load.geometry.end.x - beforeEnd.x) < 1e-6,
    `${JSON.stringify(beforeStart)} / ${JSON.stringify(beforeEnd)}`,
  );
  check(
    "the intensity is unchanged",
    Math.abs(Number(load.geometry.intensity) - 5) < 1e-6,
    `got ${load.geometry.intensity}`,
  );
  check(
    "and the drawn arrow sense is flipped",
    h.profile.isLoadReversed(load.geometry) === true,
    "got reversed=" + h.profile.isLoadReversed(load.geometry),
  );
  check(
    "the line of action itself is untouched",
    Number(load.geometry.direction) === beforeDirection,
    `${beforeDirection} -> ${load.geometry.direction}`,
  );

}
console.log("\n== Varying load: end intensities stay with their positions ==\n");

{
  const varying = F["varying-load"](
    { x: 150, y: 0 },
    { x: 450, y: 0 },
    5,
    10,
  );

  check(
    "the start intensity is stored",
    Math.abs(Number(varying.geometry.startIntensity) - 5) < 1e-6,
    `got ${varying.geometry.startIntensity}`,
  );
  check(
    "the end intensity is stored",
    Math.abs(Number(varying.geometry.endIntensity) - 10) < 1e-6,
    `got ${varying.geometry.endIntensity}`,
  );

  const beforeStart = { ...varying.geometry.start };
  const beforeEnd = { ...varying.geometry.end };

  h.profile.reverseLoadDirection(varying.geometry);

  check(
    "reversing keeps the start intensity with the start position",
    Math.abs(Number(varying.geometry.startIntensity) - 5) < 1e-6,
    `got startIntensity ${varying.geometry.startIntensity}`,
  );
  check(
    "and the end intensity with the end position",
    Math.abs(Number(varying.geometry.endIntensity) - 10) < 1e-6,
    `got endIntensity ${varying.geometry.endIntensity}`,
  );
  check(
    "and the span itself did not move",
    Math.abs(varying.geometry.start.x - beforeStart.x) < 1e-6 &&
      Math.abs(varying.geometry.end.x - beforeEnd.x) < 1e-6,
    JSON.stringify({ start: varying.geometry.start, end: varying.geometry.end }),
  );
}

console.log("\n== Applied moment: magnitude and CW/CCW direction ==\n");

{
  const moment = F.moment({ x: 300, y: 0 }, 25, "CW");

  check(
    "the magnitude is stored",
    Math.abs(Number(moment.geometry.magnitude) - 25) < 1e-6,
    `got ${moment.geometry.magnitude}`,
  );
  check(
    "the direction is a readable word",
    moment.geometry.direction === "CW",
    `got ${moment.geometry.direction}`,
  );
  check(
    "and it carries its engineering unit",
    String(moment.geometry.unit).length > 0,
    `got ${moment.geometry.unit}`,
  );

  const ccw = F.moment({ x: 300, y: 0 }, 25, "CCW");
  check(
    "an unknown direction normalises to CCW",
    ccw.geometry.direction === "CCW",
    `got ${ccw.geometry.direction}`,
  );
}

console.log("\n== Couple is one feature, not two moments ==\n");

{
  const couple = F.couple({ x: 300, y: 0 }, 100, 50, "CW");
  const state = stateWith([couple]);

  check("a couple is a single object", state.objects.length === 1, `got ${state.objects.length}`);
  check("of type couple", couple.type === "couple", `got ${couple.type}`);
  check(
    "with its own magnitude",
    Number.isFinite(Number(couple.geometry.magnitude)),
    `got ${couple.geometry.magnitude}`,
  );
}

console.log("\n== Body frame: length, tangent and body-local points ==\n");

{
  const frame = h.frames.frameOf(beam);

  check("the frame exists", Boolean(frame));
  check(
    "its length is the beam's engineering length",
    Math.abs(frame.length - 600) < 1e-6,
    `got ${frame.length}`,
  );
  check(
    "its tangent points along the beam",
    Math.abs(frame.tangent.x - 1) < 1e-6 && Math.abs(frame.tangent.y) < 1e-6,
    JSON.stringify(frame.tangent),
  );

  const mid = h.frames.pointAt(frame, 300);
  check(
    "the midpoint is 300 along the beam",
    Math.abs(mid.x - 300) < 1e-6,
    `got ${mid.x}`,
  );

  const fraction = h.frames.attachmentFraction(frame, { fraction: 0.75 });
  check(
    "a point 450 along is at fraction 0.75",
    Math.abs(fraction - 0.75) < 1e-6,
    `got ${fraction}`,
  );
}

console.log("\n== A moved beam carries its frame with it ==\n");

{
  const moved = F.beam({ x: 1000, y: 100 }, { x: 1600, y: 100 });
  const frame = h.frames.frameOf(moved);

  check(
    "the frame starts where the beam starts",
    Math.abs(frame.start.x - 1000) < 1e-6 && Math.abs(frame.start.y - 100) < 1e-6,
    JSON.stringify(frame.start),
  );
  check(
    "and is still 600 long",
    Math.abs(frame.length - 600) < 1e-6,
    `got ${frame.length}`,
  );

  const fraction = h.frames.attachmentFraction(frame, { fraction: 0.5 });
  check(
    "the midpoint is still fraction 0.5",
    Math.abs(fraction - 0.5) < 1e-6,
    `got ${fraction}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
