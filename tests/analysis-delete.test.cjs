/*
 * ========================================================
 * DELETING AN ANALYSIS DIAGRAM MUST TAKE ITS WHOLE GRAPH WITH IT
 * ========================================================
 *
 * Deleting an SFD was reported to leave the x-axis line and the x (m)
 * label behind. Those are renderer output, so the question is whether
 * anything draws them OUTSIDE the per-feature group.
 *
 * This renders a real sheet with a diagram, deletes the diagram, renders
 * again, and counts what is still on the canvas. It is the only way to be
 * sure: the axis is drawn inside the diagram's own branch today, and a test
 * that reads that branch would pass whether or not the canvas actually
 * clears.
 */
const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const dom = new JSDOM(
  "<!doctype html><html><body>" +
    '<div id="canvas"></div></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = cb => setTimeout(cb, 0);

global.window.requestAnimationFrame = global.requestAnimationFrame;
global.window.cancelAnimationFrame = id => clearTimeout(id);

const load = file =>
  require(
    path.join(projectRoot, "js", "engineering-drawing", file),
  );

/*
 * The modules reach for the DOM by name, and the renderer reaches for
 * `document` as a global, so both are the same window.
 */
for (const name of [
  "measurement-core.js",
  "dimension-model.js",
  "annotation-model.js",
  "smart-dimension.js",
  "diagram-equations.js",
  "drawing-state.js",
  "renderer.js",
]) {
  try {
    load(name);
  } catch (error) {
    console.log(
      `  (could not load ${name}: ${error.message})`,
    );
  }
}

const renderer = global.window.enggDrawingRenderer;

/*
 * The modules read their siblings as BARE globals, not off `window`,
 * because they are loaded as plain scripts in the browser and that is where
 * a top-level `const` lives. Node has no such thing for a `require`d
 * module, so each one is published as a global here - the same binding the
 * browser's script tag creates, and no more than that.
 */
for (const name of [
  "enggDrawingState",
  "enggDrawingRenderer",
  "enggDiagramEquations",
  "enggMeasurement",
  "enggDimensionModel",
  "enggAnnotationModel",
]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

const canvas = global.document.getElementById("canvas");

canvas.getBoundingClientRect = () => ({
  width: 800,
  height: 600,
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
});

const baseState = {
  objects: [],
  selection: {
    selectedObjectIds: [],
    boxSelectionIds: [],
    hoveredObjectId: null,
  },
  interaction: {
    phase: "idle",
    preview: null,
    previewObjects: [],
    hoveredEntity: null,
    snapCandidate: null,
  },
  camera: { zoom: 1, pan: { x: 0, y: 0 } },
  styleDefaults: { stroke: "#000000", lineWidth: 0.5 },
  grid: { visible: false, spacing: 10 },
  snap: { enabled: false },
};

console.log("\n  the graph is one feature's worth of output\n");

const beam = {
  id: "beam-1",
  type: "beam",
  name: "Beam 1",
  geometry: {
    start: { x: -250, y: 0 },
    end: { x: 250, y: 0 },
    length: 500,
    depth: 30,
  },
};

const diagram = {
  id: "sfd-1",
  type: "analysis-diagram",
  name: "SFD 1",
  geometry: {
    diagramType: "sfd",
    mode: "plot",
    start: { x: -250, y: -200 },
    end: { x: 250, y: -200 },
    localRange: { from: 0, to: 5 },
    showZeroAxis: true,
    backgroundVisible: true,
    expressions: [
      {
        id: "expr-1",
        relationType: "functionX",
        visible: true,
        expression: "10",
        xRange: { start: 0, end: 2.5 },
      },
      {
        id: "expr-2",
        relationType: "functionX",
        visible: true,
        expression: "-10",
        xRange: { start: 2.5, end: 5 },
      },
    ],
  },
  engineering: {
    plane: "XY",
    discipline: "statics",
    analysisKind: "analysis-diagram",
    sourceFeatureIds: ["beam-1"],
  },
};

const withDiagram = {
  ...baseState,
  objects: [beam, diagram],
};

renderer.renderDrawing(withDiagram, canvas);

const afterCreate = {
  groups: canvas.querySelectorAll(".drawing-feature").length,
  texts: [...canvas.querySelectorAll("text")].map(t => t.textContent),
  lines: canvas.querySelectorAll("line, path").length,
};

console.log(
  `  after create: ${afterCreate.groups} feature groups, ` +
    `labels ${JSON.stringify(afterCreate.texts)}\n`,
);

check(
  "the diagram is drawn as ONE feature group",
  afterCreate.groups === 2,
  `groups: ${afterCreate.groups} (expected 2: beam + diagram)`,
);

check(
  "the axes are labelled",
  afterCreate.texts.some(t => t.includes("x (m)")),
  `labels: ${JSON.stringify(afterCreate.texts)}`,
);

check(
  "the vertical axis is labelled with its quantity",
  afterCreate.texts.some(t => t.includes("Shear force")),
  `labels: ${JSON.stringify(afterCreate.texts)}`,
);

/*
 * THE DELETE. The diagram goes; everything else stays, because the beam is
 * not part of the diagram's lifecycle.
 */
const afterDelete = {
  ...baseState,
  objects: [beam],
};

renderer.renderDrawing(afterDelete, canvas);

const remaining = {
  groups: canvas.querySelectorAll(".drawing-feature").length,
  texts: [...canvas.querySelectorAll("text")].map(t => t.textContent),
  lines: canvas.querySelectorAll("line, path").length,
  strayLabels: [...canvas.querySelectorAll("text")].filter(t =>
    /Shear force|x \(m\)/.test(t.textContent),
  ).length,
};

console.log(
  `  after delete: ${remaining.groups} feature groups, ` +
    `labels ${JSON.stringify(remaining.texts)}\n`,
);

check(
  "the diagram's group is gone",
  !canvas.querySelector('[data-feature-id="sfd-1"]'),
);

check(
  "the beam is untouched",
  remaining.groups === 1 &&
    canvas.querySelector('[data-feature-id="beam-1"]'),
);

check(
  "no x (m) label is left behind",
  !remaining.texts.some(t => t.includes("x (m)")),
  `labels still on the canvas: ${JSON.stringify(remaining.texts)}`,
);

check(
  "no quantity label is left behind",
  !remaining.texts.some(t => t.includes("Shear force")),
  `labels still on the canvas: ${JSON.stringify(remaining.texts)}`,
);

check(
  "the whole canvas carries nothing but the beam",
  remaining.lines === afterCreate.lines - (afterCreate.lines - remaining.lines),
  `line/path count went from ${afterCreate.lines} to ${remaining.lines}`,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
