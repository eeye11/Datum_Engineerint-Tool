/*
 * Audit: dependencies, deletion, undo/redo and persistence.
 *
 * The chain under test: a source feature changes or is deleted, and every
 * derived feature (components, resultant, diagrams, annotations) either
 * follows it or is cleaned up - through the real COMMIT path, not by calling
 * refresh functions directly.
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

console.log("\n== A derived feature follows its source through a COMMIT ==\n");

{
  const source = forceAt("force-1", 0, 100);
  const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  D.registerDependency(resultant, [source.id]);

  const state = freshState([source, resultant]);
  D.refreshAnalysis(resultant, state);

  const before = resultant.geometry.magnitude;

  /* A student edits the magnitude - the path a real edit takes. */
  const snapshot = JSON.parse(JSON.stringify(state.objects));
  source.geometry.magnitude = 250;
  S.commitDrawingChange(state, snapshot);

  check(
    "the resultant follows a committed source edit",
    Math.abs(resultant.geometry.magnitude - 250) < 0.5,
    `before ${before}, after ${resultant.geometry.magnitude}`,
  );
}

console.log("\n== Deleting a source force removes a now-empty resultant ==\n");

{
  const source = forceAt("force-1", 0, 100);
  const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  D.registerDependency(resultant, [source.id]);

  const state = freshState([source, resultant]);
  D.refreshAnalysis(resultant, state);

  const removed = D.resolveDeletedSources(state, [source.id]);

  check(
    "the resultant is gone when its only source is deleted",
    !state.objects.some((o) => o.id === resultant.id),
    `still present: ${state.objects.map((o) => o.type).join(", ")}`,
  );
  check(
    "and the removal is reported",
    removed.includes(resultant.id),
    JSON.stringify(removed),
  );
}

console.log("\n== Deleting ONE of two sources keeps the resultant ==\n");

{
  const a = forceAt("force-a", 0, 100);
  const b = forceAt("force-b", 90, 100);
  const resultant = F.resultant({ x: 0, y: 0 }, { x: 1, y: 0 });
  D.registerDependency(resultant, [a.id, b.id]);

  const state = freshState([a, b, resultant]);
  D.refreshAnalysis(resultant, state);

  D.resolveDeletedSources(state, [a.id]);

  check(
    "the resultant survives",
    state.objects.some((o) => o.id === resultant.id),
    `objects: ${state.objects.map((o) => o.type).join(", ")}`,
  );
  check(
    "and now reports only the surviving source",
    JSON.stringify(D.sourceIdsOf(resultant)) === JSON.stringify([b.id]),
    JSON.stringify(D.sourceIdsOf(resultant)),
  );
  check(
    "and its magnitude is the surviving force alone",
    Math.abs(resultant.geometry.magnitude - 100) < 0.5,
    `got ${resultant.geometry.magnitude}`,
  );
}

console.log("\n== A deleted member leaves a diagram unresolved, not orphaned ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
  const diagram = F["analysis-diagram"]
    ? F["analysis-diagram"]({ x: 0, y: -200 }, { x: 600, y: -200 })
    : null;

  if (!diagram) {
    console.log("  (no analysis-diagram factory - skipped)");
  } else {
    diagram.geometry.diagramType = "sfd";
    diagram.geometry.mode = "plot";
    D.registerDependency(diagram, [beam.id]);

    const state = freshState([beam, diagram]);
    D.refreshAnalysis(diagram, state);

    D.resolveDeletedSources(state, [beam.id]);

    check(
      "the diagram itself is kept",
      state.objects.some((o) => o.id === diagram.id),
      `objects: ${state.objects.map((o) => o.type).join(", ")}`,
    );
    check(
      "and is marked unresolved rather than left looking valid",
      diagram.engineering.unresolved === true,
      `unresolved=${diagram.engineering.unresolved}`,
    );
  }
}

console.log("\n== Deleting a beam removes its children ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
  const support = F["pin-support"]({ x: 0, y: 0 });
  support.parentId = beam.id;
  const load = F.load({ x: 100, y: 0 }, { x: 400, y: 0 }, 5);
  load.parentId = beam.id;

  const state = freshState([beam, support, load]);

  S.removeObjectsAndDescendants(state, [beam.id]);

  check(
    "the beam is gone",
    !state.objects.some((o) => o.id === beam.id),
  );
  check(
    "and so are its support and load",
    !state.objects.some((o) => o.id === support.id) &&
      !state.objects.some((o) => o.id === load.id),
    `objects: ${state.objects.map((o) => o.type).join(", ")}`,
  );
  check(
    "leaving no orphan",
    state.objects.length === 0,
    `got ${state.objects.length}`,
  );
}

console.log("\n== Deleting a child does NOT delete its parent ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
  const support = F["pin-support"]({ x: 0, y: 0 });
  support.parentId = beam.id;

  const state = freshState([beam, support]);

  S.removeObjectsAndDescendants(state, [support.id]);

  check(
    "the parent beam survives",
    state.objects.some((o) => o.id === beam.id),
    `objects: ${state.objects.map((o) => o.type).join(", ")}`,
  );
  check(
    "and only the support is gone",
    !state.objects.some((o) => o.id === support.id),
  );
}

console.log("\n== Undo restores what a commit removed ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 0 });
  const support = F["pin-support"]({ x: 0, y: 0 });
  support.parentId = beam.id;

  const state = freshState([beam, support]);

  const snapshot = S.snapshotDrawing(state);
  S.removeObjectsAndDescendants(state, [beam.id]);
  S.commitDrawingChange(state, snapshot);

  check("the deletion took effect", state.objects.length === 0, `got ${state.objects.length}`);
  check("and there is something to undo", S.canUndo(state));

  S.undo(state);

  check(
    "undo restores the beam and its support",
    state.objects.length === 2,
    `got ${state.objects.length}`,
  );
  check(
    "with their relationship intact",
    state.objects.find((o) => o.type === "pin-support").parentId ===
      state.objects.find((o) => o.type === "beam").id,
  );

  S.redo(state);

  check("and redo removes them again", state.objects.length === 0, `got ${state.objects.length}`);
}

console.log("\n== A cycle of parents does not hang the delete ==\n");

{
  const a = { id: "a", type: "beam", name: "A", geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, style: {}, metadata: {} };
  const b = { id: "b", type: "beam", name: "B", parentId: "a", geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, style: {}, metadata: {} };
  a.parentId = "b";

  const state = freshState([a, b]);

  const started = Date.now();
  S.removeObjectsAndDescendants(state, ["a"]);
  const elapsed = Date.now() - started;

  check(
    "a cyclic parent graph is deleted without hanging",
    elapsed < 1000 && state.objects.length === 0,
    `elapsed ${elapsed}ms, remaining ${state.objects.length}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);