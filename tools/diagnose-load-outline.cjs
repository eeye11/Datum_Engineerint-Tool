/*
 * Answers one question directly: with the OLD envelope line, does the
 * outline actually collapse?
 *
 * The verify script reported that its test still passed with the old code
 * in place, which cannot be right if the reasoning is right - so either the
 * reasoning is wrong or the test is measuring the wrong polygon. This
 * loads both versions of the renderer side by side and measures the height
 * of every `drawing-load-profile` polygon each one produces.
 *
 * Run from the project root:  node tools/diagnose-load-outline.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");
const rendererPath = path.join(
  projectRoot,
  "js",
  "engineering-drawing",
  "renderer.js",
);

const original = fs.readFileSync(rendererPath, "utf8");

/* ============================================================
 * BUILD THE OLD VERSION, LINE BY LINE
 * ============================================================ */

const lines = original.split("\n");

const open = lines.findIndex((line) =>
  line.includes("...samples.map(sample => {"),
);

const ret = lines.findIndex(
  (line, index) =>
    index > open && line.includes("return `${drawn.far.x},${drawn.far.y}`;"),
);

const close = lines.findIndex(
  (line, index) => index > ret && line.trim() === "}),",
);

if (open < 0 || ret < 0 || close < 0) {
  console.log("could not find the envelope block");
  process.exit(1);
}

const indent = lines[open].slice(0, lines[open].indexOf("..."));

const buggyBlock = [
  `${indent}...samples.map(sample => {`,
  `${indent}    const drawn = forceEndpoints(`,
  `${indent}        toScreen(sample.base),`,
  `${indent}        direction,`,
  `${indent}        distributedLoadArrowLength(`,
  `${indent}            sample.magnitude,`,
  `${indent}            scale,`,
  `${indent}            vectorScaleOf(state)`,
  `${indent}        ),`,
  `${indent}        normal`,
  `${indent}    );`,
  ``,
  `${indent}    const tip = reversed`,
  `${indent}        ? drawn.application`,
  `${indent}        : drawn.far;`,
  ``,
  `${indent}    return \`\${tip.x},\${tip.y}\`;`,
  `${indent}}),`,
];

const buggy = [
  ...lines.slice(0, open),
  ...buggyBlock,
  ...lines.slice(close + 1),
].join("\n");

fs.writeFileSync(path.join(require("os").tmpdir(), "renderer-buggy.js"), buggy);

/* ============================================================
 * MEASURE BOTH
 * ============================================================ */

function measure(rendererSource, label) {
  /* A fresh DOM per version, so neither can inherit the other's. */
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="c"></div></body></html>',
    { pretendToBeVisual: true },
  );

  global.window = dom.window;
  global.document = dom.window.document;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  for (const name of [
    "measurement-core.js",
    "dimension-model.js",
    "annotation-model.js",
    "smart-dimension.js",
    "diagram-equations.js",
    "load-profile.js",
    "body-frames.js",
    "drawing-state.js",
  ]) {
    require(path.join(projectRoot, "js", "engineering-drawing", name));
  }

  for (const name of [
    "enggDrawingState",
    "enggLoadProfile",
    "enggDiagramEquations",
  ]) {
    if (global.window[name]) {
      global[name] = global.window[name];
    }
  }

  global.window.enggDrawingRenderer = undefined;

  const script = new vm.Script(rendererSource, {
    filename: "renderer.js",
  });

  script.runInThisContext();

  const renderer = global.window.enggDrawingRenderer;

  const canvas = dom.window.document.getElementById("c");

  canvas.getBoundingClientRect = () => ({
    width: 800,
    height: 600,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
  });

  const base = {
    selection: {
      selectedObjectIds: [],
      boxSelectionIds: [],
      hoveredObjectId: null,
    },
    interaction: {
      phase: "idle",
      preview: null,
      previewObjects: [],
    },
    camera: { zoom: 1, panX: 0, panY: 0 },
    styleDefaults: {},
    grid: { visible: false },
    snap: { enabled: false },
  };

  const makeLoad = () => ({
    id: "load-1",
    type: "load",
    geometry: {
      start: { x: -50, y: 0 },
      end: { x: 50, y: 0 },
      intensity: 10,
      direction: -90,
      interval: 20,
      points: [
        { t: 0, magnitude: 10 },
        { t: 1, magnitude: 10 },
      ],
    },
    style: { stroke: "#000000", lineWidth: 0.5 },
  });

  const heights = (reversed) => {
    const load = makeLoad();

    if (reversed) {
      global.window.enggLoadProfile.reverseLoadDirection(load.geometry);
    }

    renderer.renderDrawing({ ...base, objects: [load] }, canvas);

    const group = canvas.querySelector(".drawing-feature");

    const profiles = [...group.querySelectorAll(".drawing-load-profile")];

    return profiles.map((profile) => {
      const ys = profile
        .getAttribute("points")
        .trim()
        .split(/\s+/)
        .map((pair) => Number(pair.split(",")[1]));

      return Number((Math.max(...ys) - Math.min(...ys)).toFixed(2));
    });
  };

  const before = heights(false);
  const after = heights(true);

  console.log(
    `\n  ${label}\n` +
      `    polygons with .drawing-load-profile: ${before.length}\n` +
      `    heights before reversal: ${JSON.stringify(before)}\n` +
      `    heights after  reversal: ${JSON.stringify(after)}\n`,
  );

  return { before, after };
}

measure(original, "CURRENT (envelope follows drawn.far)");
measure(buggy, "OLD (envelope follows the arrowhead's end)");

console.log(
  "\n  The question is whether the AFTER heights differ.\n" +
    "  If they are identical, the reversal was never reaching the\n" +
    "  envelope and the fix is not what made the outline survive.\n",
);
