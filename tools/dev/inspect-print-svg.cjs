const path = require("path");
const { JSDOM } = require("jsdom");
const projectRoot = path.join(__dirname, "..", "..");
const { createHarness } = require("../../tests/harness-renderer.js");
const { locate } = require("../../tests/helpers/source-path.cjs");

const { dom, canvas } = createHarness(projectRoot, JSDOM, require);
require(locate("drawing-bounds.js"));
require(locate("print-layout.js"));
require(locate("document-export.js"));

const state = global.window.enggDrawingState;
const layout = global.window.enggPrintLayout;
const exporter = global.window.enggDrawingExport;
const bounds = global.window.enggDrawingBounds;

/* stub sizes on created elements */
const MM = 25.4 / 96;
const orig = global.document.createElement.bind(global.document);
global.document.createElement = (t) => {
  const el = orig(t);
  el.getBoundingClientRect = () => {
    const w = parseFloat(el.style.width) / MM;
    const h = parseFloat(el.style.height) / MM;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
    };
  };
  return el;
};

const drawing = state.createDrawingState();
drawing.scale = { mmPerUnit: 250, unit: "mm", reference: null };
drawing.objects = [
  {
    id: "beam-1",
    type: "beam",
    name: "Beam",
    geometry: {
      start: { x: 1600, y: 900 },
      end: { x: 2400, y: 900 },
      depth: 20,
    },
  },
];

const rect = bounds.calculateDrawingBounds(drawing, { zoom: 1 });
const plan = layout.layout({ bounds: rect, paper: "a4", mmPerUnit: 250 });
const page = exporter.renderPrintPage(drawing, plan);

const vb = String(page.svg.getAttribute("viewBox")).split(/\s+/).map(Number);
console.log("viewBox", vb);

page.svg.querySelectorAll("*").forEach((el) => {
  const tag = el.tagName;
  let coords = "";
  if (tag === "rect")
    coords = `${el.getAttribute("x")},${el.getAttribute("y")} ${el.getAttribute("width")}x${el.getAttribute("height")}`;
  else if (tag === "path") coords = (el.getAttribute("d") || "").slice(0, 80);
  else
    coords = `${el.getAttribute("x") ?? el.getAttribute("cx") ?? ""},${el.getAttribute("y") ?? el.getAttribute("cy") ?? ""}`;
  console.log(
    tag.padEnd(10),
    "class=",
    (el.getAttribute("class") || "").padEnd(20),
    coords,
  );
});
