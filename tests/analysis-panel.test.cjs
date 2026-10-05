
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * WHAT THE FEATURES PANEL NOW SAYS ABOUT A PLOT
 * ========================================================
 *
 * The panel was a data inspector: EQUATIONS, a Segment per row with
 * From/To/f(x), Add Segment, Remove Last, and a separate CHECKS block.
 *
 * It is now a property panel that says what the diagram is and hands the
 * mathematics to the Plot Editor. This reads the ACTUAL markup the panel
 * produces - the rows are built by the same function the application calls
 * - so a change that quietly reintroduced a Segment row or the CHECKS block
 * would fail here rather than passing because the data was fine.
 *
 * The panel's own markup is assembled by a large function in drawing.js, so
 * it is exercised here the way the page does: by pulling the analysis
 * panel's own builder out of the source and running it against a real
 * analysis diagram.
 */


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

const drawingSource = fs.readFileSync(
  locate("drawing.js"),
  "utf8",
);

/*
 * The equations module really is loaded, so the expression count the panel
 * prints is a real count rather than a zero produced by a missing
 * dependency. It attaches to `window`, so one is declared first - the same
 * shape its own test file uses.
 */
global.window = {};

require(
  locate("diagram-equations.js",
  ),
);

/*
 * THE PANEL'S OWN BUILDER, extracted and run.
 *
 * analysisPanelRows is a pure function of the object - it reads geometry and
 * returns HTML strings - so it can be lifted out with its two small local
 * helpers and called directly. Reaching for the source rather than
 * reimplementing the panel is the whole point: a copy here would keep
 * passing after the real panel regressed.
 */
const start = drawingSource.indexOf("function analysisPanelRows");
const end = drawingSource.indexOf("function supportPanelRows");

check(
  "the analysis panel builder is still in drawing.js",
  start > 0 && end > start,
);

const body = drawingSource.slice(start, end);

const sandbox = {
  console,
  window: {},
  enggAnalysisDependencies: {
    sourceIdsOf: () => ["beam-1"],
  },
  drawingState: {
    objects: [{ id: "beam-1", name: "Beam 1", type: "beam" }],
  },
};

/*
 * The equations module really is loaded, so the expression count the panel
 * prints is a real count rather than a zero produced by a missing
 * dependency.
 */
sandbox.window.enggDiagramEquations =
  global.window.enggDiagramEquations;

sandbox.globalThis = sandbox;

vm.runInNewContext(
  `
  ${body}
  globalThis.__rows = analysisPanelRows;
  `,
  sandbox,
);

const analysisPanelRows = sandbox.__rows;

console.log("\n  the panel describes the diagram, not the data\n");

/* A Plot on a 522.2 mm beam, with three expressions. */
const plotObject = {
  id: "sfd-2",
  name: "SFD 2",

  /*
   * The stored type. All three diagrams share one internal type so they get
   * one renderer and one persistence path - which is exactly why the panel
   * must not print it. The student's name for it is "SFD 2" above, and the
   * quantity it plots comes from `diagramType`.
   */
  type: "analysis-diagram",
  geometry: {
    diagramType: "sfd",
    mode: "plot",
    localRange: { from: 0, to: 522.2 },
    sourceSpan: { start: { x: 0, y: 0 }, end: { x: 522.2, y: 0 }, length: 522.2 },
    referencePositions: [{ x: 0 }, { x: 200 }],
    start: { x: -221, y: 229.44 },
    position: { x: -221, y: 229.44 },
    segments: undefined,

    /*
     * THREE EXPRESSIONS, OF TWO KINDS.
     *
     * Two functions either side of a jump, and the vertical line at the
     * jump itself - which is why this is an expression list and not a
     * piecewise function: the third is not a function of x at all.
     */
    expressions: [
      {
        id: "expr-1",
        relationType: "functionX",
        visible: true,
        expression: "10",
        xRange: { start: 0, end: 200 },
      },
      {
        id: "expr-2",
        relationType: "functionX",
        visible: true,
        expression: "10 - 5x",
        xRange: { start: 200, end: 400 },
      },
      {
        id: "expr-3",
        relationType: "verticalLine",
        visible: true,
        x: 400,
        yRange: { start: -10, end: 10 },
      },
    ],
  },
};

const html = analysisPanelRows(plotObject).join("\n");

const panelText = html
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

check(
  "there is a PLOT section",
  html.includes(">PLOT<"),
);

check(
  "the plot range is shown with an arrow and a unit",
  panelText.includes("0 → 522.2 mm"),
  panelText,
);

check(
  "the panel says how many expressions there are",
  /Expressions\s*3/.test(panelText),
  panelText,
);

check(
  "the way into the editor is one control",
  html.includes("data-plot-editor-open") &&
    panelText.includes("Open Analysis Editor"),
  "the button says what it opens, and it is the editor, not just the Plot",
);

console.log("\n  the retired presentation is gone\n");

check(
  "no EQUATIONS section",
  !html.includes(">EQUATIONS<"),
);

check(
  "no CHECKS section",
  !html.includes(">CHECKS<"),
);

check(
  "nothing is called a Segment",
  !/segment/i.test(panelText),
  panelText.match(/.{0,40}[Ss]egment.{0,40}/)?.[0],
);

check(
  "no Add Segment / Remove Last buttons",
  !panelText.includes("Add Segment") &&
    !panelText.includes("Remove Last"),
);

check(
  "no f(x) control, and no equation input in the panel",
  !html.includes("f(x)") &&
    !html.includes("data-diagram-field") &&
    !html.includes("data-diagram-segment"),
);

console.log("\n  internal implementation detail stays out of it\n");

check(
  "the raw feature type is not shown",
  !panelText.includes("analysis-diagram"),
);

check(
  "the count of source positions is not shown as a number",
  !/Source Positions/.test(panelText),
  panelText.match(/.{0,40}Source Positions.{0,40}/)?.[0],
);

check(
  "the reference is named as an engineering quantity",
  panelText.includes("Reference") &&
    panelText.includes("Body Length"),
  panelText,
);

console.log("\n  the panel still answers what it is and where it is\n");

check(
  "the source body is named",
  panelText.includes("Beam 1"),
);

check(
  "the display options are kept, and clearly named",
  panelText.includes("Zero Axis") &&
    panelText.includes("Background") &&
    panelText.includes("Source Reference"),
  panelText,
);

check(
  "position is its own section, in mm",
  panelText.includes("POSITION") &&
    panelText.includes("-221 mm") &&
    panelText.includes("229.44 mm"),
  panelText,
);

check(
  "appearance is one line-type dropdown, not a list of controls",
  (html.match(/data-style="lineType"/g) || []).length <= 1,
);

console.log("\n  a sketch gets no plot section at all\n");

const sketchHtml = analysisPanelRows({
  ...plotObject,
  geometry: {
    ...plotObject.geometry,
    mode: "sketch",
    segments: undefined,
  },
}).join("\n");

/*
 * A SKETCH IS NOT A PLOT, AND THE PANEL SAYS SO.
 *
 * It counts ELEMENTS rather than expressions - reusing the word would leave
 * the student to work out which they are looking at - and it opens the
 * editor rather than offering nothing.
 *
 * It used to assert that a sketch had NO editor control at all, which was
 * true only because no sketch editor existed. Now that one does, the button
 * is the point: the drawing is made there, and a panel that hid the way in
 * would leave a sketch with nowhere to go.
 */
check(
  "a sketch counts elements, not expressions",
  !sketchHtml.includes("Expressions") &&
    sketchHtml.includes("Elements"),
  "the sketch panel is not distinguishing its content from a plot",
);

check(
  "and it offers the same way into the editor",
  sketchHtml.includes("data-plot-editor-open") &&
    sketchHtml.includes("Open Analysis Editor"),
  "a sketch has no editor button, so the drawing has nowhere to be made",
);

console.log("\n  an older file still opens, and is counted honestly\n");

/*
 * A DRAWING SAVED BEFORE EXPRESSIONS EXISTED.
 *
 * It holds `segments` and nothing else. The panel has to read them - so the
 * count describes the expressions the diagram really has rather than
 * dropping to zero and telling the student their diagram is empty.
 */
const legacyHtml = analysisPanelRows({
  ...plotObject,
  geometry: {
    ...plotObject.geometry,
    expressions: undefined,
    segments: [
      { id: "seg-0", from: 0, to: 261, equation: "10" },
      { id: "seg-1", from: 261, to: 522, equation: "10 - 5x" },
    ],
  },
}).join("\n");

const legacyText = legacyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

check(
  "a legacy segment list is still counted as its expressions",
  /Expressions\s*2/.test(legacyText),
  legacyText,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
