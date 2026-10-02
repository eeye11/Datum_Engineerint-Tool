/*
 * DOES AN ANALYSIS DIAGRAM DRAW?
 *
 * The feature appeared in the Features panel and the status line said
 * "Reference axis placed" while the canvas showed nothing at all. So
 * "the feature exists" proved to be no evidence that "the feature renders",
 * and this file renders one for real and looks at the output.
 *
 * The whole path, in Node with no browser:
 *
 *     axis from the source  ->  the factory  ->  the renderer
 *
 * The renderer's own rule is that a feature group is appended ONLY if it
 * drew at least one child, so an empty group is the signature of a branch
 * that returned early. That is what is asserted against.
 *
 * ONE LEVEL BODY ONLY, deliberately. This file answers a single question,
 * and every extra case is another DOM stub that can be wrong for reasons
 * that have nothing to do with the bug.
 */

global.window = {
  crypto: {
    randomUUID: () => "diagram-draw-uuid"
  }
};

function makeElement(tag) {
  const classes = new Set();

  const element = {
    tagName: String(tag).toUpperCase(),
    attributes: {},
    children: [],
    dataset: {},
    style: {},
    textContent: "",

    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
      toggle: (n, on) => {
        if (on === undefined) {
          if (classes.has(n)) {
            classes.delete(n);
            return false;
          }
          classes.add(n);
          return true;
        }
        if (on) classes.add(n);
        else classes.delete(n);
        return on;
      }
    },

    get firstChild() {
      return this.children[0] || null;
    },

    get childNodes() {
      return this.children;
    },

    setAttribute(name, value) {
      element.attributes[name] = String(value);
    },

    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(
        element.attributes,
        name
      )
        ? element.attributes[name]
        : null;
    },

    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(
        element.attributes,
        name
      );
    },

    appendChild(child) {
      this.children.push(child);
      return child;
    },

    insertBefore(child) {
      this.children.unshift(child);
      return child;
    },

    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      return child;
    },

    addEventListener() {}
  };

  return element;
}

global.window.document = {
  createElement: makeElement,
  createElementNS: (_ns, tag) => makeElement(tag),
  createTextNode: (text) => ({
    nodeType: 3,
    textContent: String(text)
  })
};

global.document = global.window.document;

require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/body-frames.js");
require("../js/engineering-drawing/analysis-dependencies.js");
require("../js/engineering-drawing/drawing-state.js");
require("../js/engineering-drawing/renderer.js");

const state = global.window.enggDrawingState;
const renderer = global.window.enggDrawingRenderer;
const deps = global.window.enggAnalysisDependencies;

global.enggDrawingState = state;
global.enggBodyFrames = global.window.enggBodyFrames;
global.enggFeatureGeometry = global.window.enggFeatureGeometry;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
    );
  }
};

console.log("\n  an analysis diagram draws\n");

const BOUNDS = { left: 0, top: 0, width: 1200, height: 900 };

const host = makeElement("div");
host.getBoundingClientRect = () => BOUNDS;

/*
 * ensureSvg asks the canvas for an existing ".drawing-renderer" and only
 * mints one when there is none. A stub that always answers null therefore
 * produces a fresh SVG on every call, and the test would count a growing
 * pile of canvases instead of one canvas holding every feature.
 */
host.querySelector = (selector) =>
  selector === ".drawing-renderer"
    ? host.children.find(
        (c) =>
          c.tagName === "SVG" &&
          c.classList.contains("drawing-renderer")
      ) || null
    : null;

host.querySelectorAll = () => [];

const drawingState = {
  version: 1,
  units: "mm",
  camera: { zoom: 1, panX: 0, panY: 0 },
  grid: { visible: false, spacing: 5 },
  snap: { enabled: true, spacing: 1 },
  objectSnap: { enabled: false, tolerancePx: 10 },
  statics: { vectorScale: 1 },
  styleDefaults: {
    stroke: "#000000",
    lineWidth: 0.5,
    lineType: "solid"
  },
  selection: { selectedObjectIds: [], hoveredObjectId: null },
  interaction: { phase: "idle", previewObjects: [] },
  objects: []
};

/*
 * ONE SOURCE, THREE ORIENTATIONS. A level beam and two sloping ones,
 * because an axis taken from the screen rather than from the member is
 * indistinguishable on the first and obvious on the others.
 */
const SOURCES = [
  ["level", { x: 0, y: 0, end: { x: 300, y: 0 } }],
  ["rising", { x: 0, y: 0, end: { x: 200, y: 120 } }],
  ["falling", { x: -100, y: 40, end: { x: 100, y: -40 } }]
];

const DIAGRAMS = [
  ["sfd", "shear-force-diagram"],
  ["bmd", "bending-moment-diagram"],
  ["afd", "axial-force-diagram"]
];

/*
 * The colour each diagram must appear in, mirroring the renderer's own
 * table. Written out here rather than imported so the test would still
 * fail if the table were emptied - importing it would make the two agree
 * by construction and prove nothing.
 */
const EXPECTED_TINT = {
  sfd: "#1f5c38",
  bmd: "#8a4b1f",
  afd: "#1f4a7a"
};

const renderedGroups = () => {
  const svg = host.children.find(
    (c) => c.tagName === "SVG" && c.classList.contains("drawing-renderer")
  );

  return svg ? svg.children.filter((c) => c.tagName === "G") : [];
};

SOURCES.forEach(([label, span]) => {
  const beam = {
    id: `beam-${label}`,
    type: "beam",
    geometry: {
      start: { x: span.x, y: span.y },
      end: { ...span.end },
      depth: 12
    }
  };

  const axis = deps.axisFromSource(beam, -70);

  DIAGRAMS.forEach(([shortForm, factoryName]) => {
    const diagram = state.geometryFactories[factoryName](
      axis.start,
      axis.end,
      { name: shortForm.toUpperCase() }
    );

    drawingState.objects = [beam, diagram];
    drawingState.selection.selectedObjectIds = [];

    renderer.renderDrawing(drawingState, host);

    const groups = renderedGroups();

    const summary = groups
      .map(
        (g) =>
          `${(g.dataset && g.dataset.featureId) || "?"}(${g.children.length})`
      )
      .join(", ");

    /*
     * The beam goes in first, so if IT is missing the harness is at fault
     * rather than the diagram, and every later assertion would be
     * reporting the harness's failure as the renderer's.
     */
    check(
      `${label} ${shortForm.toUpperCase()}: the beam draws, so the harness is answering`,
      groups.some((g) => g.dataset && g.dataset.featureId === beam.id),
      `groups: ${summary || "no svg"}`
    );

    const diagramGroup = groups.find(
      (g) => g.dataset && g.dataset.featureId === diagram.id
    );

    check(
      `${label} ${shortForm.toUpperCase()}: a feature group is appended`,
      !!diagramGroup,
      `groups: ${summary || "no svg"}`
    );

    check(
      `${label} ${shortForm.toUpperCase()}: the group actually drew something`,
      !!diagramGroup && diagramGroup.children.length > 0,
      `children: ${diagramGroup ? diagramGroup.children.length : "no group"}`
    );

    /*
     * IT DREW THE RIGHT THING, not merely anything.
     *
     * "A group exists with children in it" is satisfied by a grey box, and
     * a grey box is what a MISSED TINT LOOKS LIKE: the lookup falls
     * through to the SFD green silently, so a BMD comes out the wrong
     * colour with nothing to report it. Asserting only the group would let
     * exactly that through, which is the gap this check closes.
     */
    const fills = (diagramGroup
      ? diagramGroup.children
      : []
    ).map(
      (c) => c.attributes && c.attributes.fill
    );

    const strokes = (diagramGroup
      ? diagramGroup.children
      : []
    ).map(
      (c) => c.attributes && c.attributes.stroke
    );

    const used = [...fills, ...strokes].filter(Boolean);

    check(
      `${label} ${shortForm.toUpperCase()}: it is drawn in ITS OWN colour, not a fallback`,
      used.includes(EXPECTED_TINT[shortForm]),
      `expected ${EXPECTED_TINT[shortForm]}, used ${JSON.stringify(used)}`
    );
  });
});

DIAGRAMS.forEach(([shortForm, factoryName]) => {
  const diagram = state.geometryFactories[factoryName](
    { x: 0, y: -70 },
    { x: 300, y: -70 },
    {}
  );

  check(
    `${shortForm.toUpperCase()} stores its type as the short form`,
    diagram.geometry.diagramType === shortForm,
    `diagramType = ${JSON.stringify(diagram.geometry.diagramType)}`
  );
});

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
