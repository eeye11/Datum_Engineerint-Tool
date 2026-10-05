/*
 * Renders the Plot Editor's markup into a standalone page.
 *
 * A screenshot aid, and it is worth being explicit about why it builds the
 * markup through the module rather than copying it: the dialog's layout is
 * the thing being judged here, and a hand-copied HTML file would drift
 * from the real one the moment a class name changed - which is exactly the
 * kind of drift a screenshot is supposed to catch.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

require(
  require("../../tests/helpers/source-path.cjs").locate("diagram-equations.js"),
);

const eq = global.window.enggDiagramEquations;

/*
 * The graph is drawn through the renderer's own mapping. This is the same
 * slice the plot editor uses, evaluated against a bare DOM.
 */
const rendererSource = fs.readFileSync(
  require("../../tests/helpers/source-path.cjs").locate("renderer.js"),
  "utf8",
);

const rendererDom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

rendererDom.window.enggDiagramEquations = global.window.enggDiagramEquations;

const analysisPlotMarks = vm.runInNewContext(
  `(function (window) {
     ${rendererSource.slice(
       rendererSource.indexOf("function analysisPlotMarks"),
       rendererSource.indexOf("function appendAnalysisPlot"),
     )};
     return analysisPlotMarks;
   })`,
  { window: rendererDom.window },
)(rendererDom.window);

global.window.enggDrawingRenderer = { analysisPlotMarks };

require(
  require("../../tests/helpers/source-path.cjs").locate("plot-editor.js"),
);

const editor = global.window.enggPlotEditor;

const range = { from: 0, to: 5 };

/*
 * A REAL SFD, IN METRES, for a 5 m beam with a 10 kN point load at 2 m.
 *
 * The ranges matter here and not merely for tidiness: "10 - 5x" over
 * 0 to 522.2 would reach -2600, and the vertical scale - which is fixed by
 * the largest value anywhere in the diagram - would then be set by a
 * station the student never meant. A preview built on nonsense numbers
 * would show a graph that looks broken for reasons that have nothing to
 * do with the editor.
 */
editor.open({
  title: "Shear Force Diagram - Plot",
  quantity: eq.quantityFor("sfd"),
  range,
  expressions: [
    eq.createExpression("functionX", {
      defaultRange: { start: 0, end: 2 },
      expression: "10",
    }),
    eq.createExpression("functionX", {
      defaultRange: { start: 2, end: 5 },
      expression: "-10",
    }),
    eq.createExpression("verticalLine", {
      x: 2,
      yRange: { start: -10, end: 10 },
    }),
    eq.createExpression("functionX", {
      defaultRange: { start: 5, end: 5 },
      expression: "",
    }),
  ],
});

const css = fs.readFileSync(
  path.join(projectRoot, "css", "engineering-drawing.css"),
  "utf8",
);

const dialog = global.document.querySelector(".drawing-plot-editor").outerHTML;

fs.writeFileSync(
  path.join(projectRoot, "tools", "plot-editor-preview.html"),
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Plot Editor</title>
    <style>${css}</style>
    <style>
      body { margin: 0; background: #eef1f3; }
    </style>
  </head>
  <body>${dialog}</body>
</html>
`,
);

console.log("wrote tools/plot-editor-preview.html");
