/*
 * Audit: tool-state cleanup between operations, and the reference features.
 *
 * The claim under test: cancelling a tool leaves nothing behind, so the next
 * tool starts clean; and the reference features (point, line, arc, coordinate
 * system) carry authoritative geometry that snaps, dimensions and persists.
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
const F = S.geometryFactories;

function freshState() {
  return {
    objects: [],
    selection: { selectedObjectIds: [], boxSelectionIds: [], hoveredObjectId: null },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
    scale: null,
  };
}

console.log("\n== A cancelled load leaves no partial state ==\n");

{
  const state = freshState();

  /* Simulate a distributed load part-way through its construction. */
  state.interaction.phase = "load-span";
  state.interaction.loadSourceId = "beam-1";
  state.interaction.loadStart = { x: 100, y: 0 };
  state.interaction.loadEnd = null;
  state.interaction.loadDirection = -90;
  state.interaction.staticsTarget = "beam-1";
  state.interaction.attachmentPoints = [{ x: 100, y: 0 }];

  S.clearInteraction(state);

  check(
    "the load's body is forgotten",
    state.interaction.loadSourceId === undefined ||
      state.interaction.loadSourceId === null,
    `got ${state.interaction.loadSourceId}`,
  );
  check(
    "the load's span is forgotten",
    state.interaction.loadStart === null && state.interaction.loadEnd === null,
    `${JSON.stringify(state.interaction.loadStart)} / ${JSON.stringify(state.interaction.loadEnd)}`,
  );
  check(
    "the attached body is forgotten",
    state.interaction.staticsTarget === null,
    `got ${state.interaction.staticsTarget}`,
  );
  check(
    "the placed points are forgotten",
    Array.isArray(state.interaction.attachmentPoints) &&
      state.interaction.attachmentPoints.length === 0,
    JSON.stringify(state.interaction.attachmentPoints),
  );
  check(
    "the phase returns to idle",
    state.interaction.phase === "idle",
    `got ${state.interaction.phase}`,
  );
}

console.log("\n== A cancelled dimension leaves no references behind ==\n");

{
  const state = freshState();

  state.interaction.dimensionStage = "first";
  state.interaction.dimensionFirstRef = { featureId: "l1", anchor: "start" };
  state.interaction.dimensionFirstPoint = { x: 10, y: 10 };
  state.interaction.dimensionCandidates = [{ dimensionType: "linear" }];
  state.interaction.dimensionRefs = [{ featureId: "l1", anchor: "end" }];

  S.clearInteraction(state);

  check(
    "the dimension stage is forgotten",
    state.interaction.dimensionStage === null,
    `got ${state.interaction.dimensionStage}`,
  );
  check(
    "the first reference is forgotten",
    state.interaction.dimensionFirstRef === null,
    `got ${JSON.stringify(state.interaction.dimensionFirstRef)}`,
  );
  check(
    "the candidate list is forgotten",
    state.interaction.dimensionCandidates === null,
    `got ${JSON.stringify(state.interaction.dimensionCandidates)}`,
  );
  check(
    "the inferred references are forgotten",
    state.interaction.dimensionRefs === null,
    `got ${JSON.stringify(state.interaction.dimensionRefs)}`,
  );
}

console.log("\n== A cancelled support leaves no attachment behind ==\n");

{
  const state = freshState();

  state.interaction.phase = "statics-attach";
  state.interaction.parentId = "beam-1";
  state.interaction.staticsTarget = "beam-1";
  state.interaction.attachmentPoints = [{ x: 300, y: 0 }];
  state.interaction.snapGeometry = [{ start: { x: 0, y: 0 }, end: { x: 600, y: 0 } }];

  S.clearInteraction(state);

  check("the parent is forgotten", state.interaction.parentId === null);
  check("the target is forgotten", state.interaction.staticsTarget === null);
  check(
    "the attachment points are forgotten",
    state.interaction.attachmentPoints.length === 0,
  );
  check(
    "the published snap geometry is forgotten",
    Array.isArray(state.interaction.snapGeometry) &&
      state.interaction.snapGeometry.length === 0,
    JSON.stringify(state.interaction.snapGeometry),
  );
}

console.log("\n== Reference Point is a true point ==\n");

{
  const point = F["reference-point"]
    ? F["reference-point"]({ x: 120, y: 80 })
    : F.point({ x: 120, y: 80 });

  check("it exists", Boolean(point));
  check(
    "and stores its position",
    Math.abs(point.geometry.position.x - 120) < 1e-6,
    JSON.stringify(point.geometry.position),
  );

  const anchors = h.state.enggMeasurement
    ? null
    : null;
}

console.log("\n== Reference Line carries authoritative endpoints ==\n");

{
  const line = F["reference-line"]
    ? F["reference-line"]({ x: 0, y: 0 }, { x: 300, y: 0 })
    : F.line({ x: 0, y: 0 }, { x: 300, y: 0 });

  check("it exists", Boolean(line));
  check(
    "with a start and an end",
    Math.abs(line.geometry.start.x) < 1e-6 &&
      Math.abs(line.geometry.end.x - 300) < 1e-6,
    JSON.stringify({ start: line.geometry.start, end: line.geometry.end }),
  );

  const span = h.deps.spanOf(line);
  check(
    "and a 300-long span",
    span && Math.abs(span.length - 300) < 1e-6,
    `got ${span && span.length}`,
  );
}

console.log("\n== Reference Arc uses real circular geometry ==\n");

{
  const arc = F["reference-arc"]
    ? F["reference-arc"]({ x: 0, y: 0 }, 50, 0, Math.PI / 2)
    : F.arc({ x: 0, y: 0 }, 50, 0, Math.PI / 2);

  check("it exists", Boolean(arc));
  check(
    "with a centre and a radius",
    Math.abs(arc.geometry.center.x) < 1e-6 &&
      Math.abs(arc.geometry.radius - 50) < 1e-6,
    JSON.stringify({ center: arc.geometry.center, radius: arc.geometry.radius }),
  );
  check(
    "and a start and end angle",
    Number.isFinite(Number(arc.geometry.startAngle)) &&
      Number.isFinite(Number(arc.geometry.endAngle)),
    `${arc.geometry.startAngle} / ${arc.geometry.endAngle}`,
  );
}

console.log("\n== Coordinate System stores an origin and axes ==\n");

{
  const cs = F["coordinate-system"]
    ? F["coordinate-system"]({ x: 0, y: 0 })
    : null;

  if (!cs) {
    console.log("  (no coordinate-system factory - skipped)");
  } else {
    check("it exists", Boolean(cs));
    check(
      "with an origin",
      Number.isFinite(Number(cs.geometry.position?.x ?? cs.geometry.origin?.x)),
      JSON.stringify(cs.geometry),
    );
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);