/*
 * Audit: the analysis diagram's engineering domain and source markers.
 *
 * The claim under test: an analysis diagram's x domain is the SOURCE BODY's
 * engineering length, re-derived whenever the body changes, and its source
 * markers sit at the correct station along that domain.
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

function freshState(objects) {
  return {
    objects,
    selection: { selectedObjectIds: [], boxSelectionIds: [], hoveredObjectId: null },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1, panX: 0, panY: 0 },
    display: {},
    scale: null,
  };
}

console.log("\n== The analysis domain is the body's engineering length ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 1000, y: 0 });
  const diagram = F["analysis-diagram"]({ x: 0, y: -200 }, { x: 1000, y: -200 });
  diagram.geometry.diagramType = "sfd";
  diagram.geometry.mode = "plot";
  D.registerDependency(diagram, [beam.id]);

  const state = freshState([beam, diagram]);
  D.refreshAnalysis(diagram, state);

  check(
    "the domain runs 0 to the beam's length",
    diagram.geometry.localRange &&
      diagram.geometry.localRange.from === 0 &&
      Math.abs(diagram.geometry.localRange.to - 1000) < 1e-6,
    JSON.stringify(diagram.geometry.localRange),
  );

  check(
    "and the source span is reported as the beam's",
    Math.abs(diagram.geometry.sourceSpan.length - 1000) < 1e-6,
    JSON.stringify(diagram.geometry.sourceSpan && diagram.geometry.sourceSpan.length),
  );

  /* Lengthen the beam and re-derive. */
  beam.geometry.end = { x: 1500, y: 0 };
  D.refreshAnalysis(diagram, state);

  check(
    "lengthening the beam re-derives the domain",
    Math.abs(diagram.geometry.localRange.to - 1500) < 1e-6,
    JSON.stringify(diagram.geometry.localRange),
  );
}

console.log("\n== Source markers sit at the correct station ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 1000, y: 0 });
  const load = F.load({ x: 250, y: 0 }, { x: 750, y: 0 }, 5);
  load.parentId = beam.id;

  const diagram = F["analysis-diagram"]({ x: 0, y: -200 }, { x: 1000, y: -200 });
  diagram.geometry.diagramType = "sfd";
  diagram.geometry.mode = "plot";
  D.registerDependency(diagram, [beam.id]);

  const state = freshState([beam, load, diagram]);
  D.refreshAnalysis(diagram, state);

  const stations = diagram.geometry.referencePositions || [];

  check(
    "the load's boundaries appear as stations",
    stations.length >= 2,
    `got ${stations.length} stations`,
  );

  const fractions = stations.map((s) => Number(s.t)).sort((a, b) => a - b);

  check(
    "at the correct fractions along the beam",
    fractions.some((t) => Math.abs(t - 0.25) < 1e-6) &&
      fractions.some((t) => Math.abs(t - 0.75) < 1e-6),
    JSON.stringify(fractions),
  );
}

console.log("\n== A deleted body leaves the diagram unresolved, not silently stale ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 1000, y: 0 });
  const diagram = F["analysis-diagram"]({ x: 0, y: -200 }, { x: 1000, y: -200 });
  diagram.geometry.diagramType = "bmd";
  diagram.geometry.mode = "plot";
  D.registerDependency(diagram, [beam.id]);

  const state = freshState([beam, diagram]);
  D.refreshAnalysis(diagram, state);

  D.resolveDeletedSources(state, [beam.id]);

  check(
    "the diagram is marked unresolved",
    diagram.engineering.unresolved === true,
    `unresolved=${diagram.engineering.unresolved}`,
  );
}

console.log("\n== A sloping beam still yields a 0..L domain ==\n");

{
  const beam = F.beam({ x: 0, y: 0 }, { x: 600, y: 800 });
  const diagram = F["analysis-diagram"]({ x: 0, y: -200 }, { x: 600, y: -200 });
  diagram.geometry.diagramType = "afd";
  diagram.geometry.mode = "plot";
  D.registerDependency(diagram, [beam.id]);

  const state = freshState([beam, diagram]);
  D.refreshAnalysis(diagram, state);

  check(
    "a 600-800-1000 triangle gives a domain of 1000",
    Math.abs(diagram.geometry.localRange.to - 1000) < 1e-6,
    `got ${diagram.geometry.localRange.to}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);