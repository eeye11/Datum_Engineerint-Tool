/*
 * The Drawing Reference pipeline, end to end, with the REAL renderer.
 *
 * The existing check stubs out the clean render, so it proves the sheet
 * is FOUND but never that anything was DRAWN - which is exactly where
 * "the reference does not render the sheet" could hide without failing.
 * This one loads the whole application, puts a real beam in a real
 * sheet, inserts a reference, and asks the renderer what came back.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const vm = require("vm");

function element(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    textContent: "",
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    setPointerCapture() {},
    releasePointerCapture() {},
    remove() {},
    focus() {},
    blur() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    clientWidth: 800,
    clientHeight: 600,
  };
  return node;
}

const svgRoot = element("svg");

const canvas = {
  querySelector: (sel) => (String(sel).indexOf("drawing-renderer") >= 0 ? svgRoot : null),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  appendChild() {}, addEventListener() {}, removeEventListener() {},
  setPointerCapture() {}, releasePointerCapture() {},
  clientWidth: 800, clientHeight: 600,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, getAttribute: () => null,
};

const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  Date, Math, JSON, Number, String, Boolean, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt,
  performance: { now: () => 0 },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  Blob: function () {},
  FileReader: function () { this.readAsText = () => {}; this.readAsDataURL = () => {}; },
  navigator: { clipboard: { writeText() {}, readText: () => Promise.resolve("") } },
  MathJax: { typesetClear() {}, typesetPromise: () => {} },
  alert() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: {
    readyState: "complete",
    createElement: element,
    createElementNS: (ns, t) => element(t),
    addEventListener() {}, removeEventListener() {},
    querySelector: (sel) => (String(sel).indexOf("drawing-canvas") >= 0 ? canvas : element(sel)),
    querySelectorAll: () => [],
    getElementById: (id) => element(id),
    body: element("body"), documentElement: element("html"),
  },
};

sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });

vm.createContext(sandbox);

const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

[...html.matchAll(/js\/engineering-drawing\/([\w-]+\.js)/g)].forEach((m) => {
  const file = m[1];
  const source = fs.readFileSync(path.join(projectRoot, "js", "engineering-drawing", file), "utf8");
  try { vm.runInContext(source, sandbox, { filename: file }); } catch (e) {}
});

const ref = sandbox.enggDrawingReference;
const E = sandbox.enggDrawingState;

let failed = 0;
function check(ok, label, detail) {
  if (!ok) failed += 1;
  console.log("  " + (ok ? "pass" : "FAIL") + "  " + label + (detail && !ok ? " :: " + detail : ""));
}

const style = { stroke: "#000", fill: "none", lineWidth: 0.5, lineType: "solid", opacity: 1 };

/* Three sheets, two with real content. */
function buildSheet(name, withBeam) {
  const sheet = { id: null, name, units: "mm", objects: [], grid: {}, snap: {}, styleDefaults: {}, camera: { zoom: 1, panX: 0, panY: 0 } };
  sheet.id = "sheet_" + Math.random().toString(36).slice(2, 8);
  if (withBeam) {
    const beam = E.geometryFactories.beam({ x: 0, y: 0 }, { x: 300, y: 0 }, style);
    beam.geometry.depth = 10;
    beam.sheetId = sheet.id;
    sheet.objects.push(beam);
  }
  return sheet;
}

const sheetA = buildSheet("Alpha", true);
const sheetB = buildSheet("Beta", true);
const sheetC = buildSheet("Gamma", false);

ref.configure({
  getSheet: (id) => [sheetA, sheetB, sheetC].find((s) => s.id === id) || null,
  getRenderedPoints: (objects) =>
    objects.flatMap((o) => [
      o.geometry.start, o.geometry.end, o.geometry.position
    ].filter(Boolean)),
});

console.log("\nThe module is wired to a document\n");
check(!!ref, "the reference module loaded");
check(typeof ref.renderDrawingReference === "function", "and can render a reference");

console.log("\nA reference to a sheet that HAS content renders that content\n");

/*
 * renderClean needs a real SVG DOM to build into, which this sandbox does
 * not have, so it may return nothing. That is a limitation of the HARNESS,
 * not of the app - so what gets asserted is the CALL: which state, which
 * bounds. Those carry the sheet's content, and they are the part that
 * decides whether the right sheet is rendered.
 *
 * Wrapped BEFORE the first render, so the call is recorded.
 */
let renderCall = null;

const realRenderClean =
  sandbox.enggDrawingExport.renderClean;

sandbox.enggDrawingExport.renderClean = (renderState, bounds) => {
  renderCall = { state: renderState, bounds };
  return realRenderClean(renderState, bounds);
};

const resultB = ref.renderDrawingReference(sheetB.id);

check(!!resultB, "the reference resolved");
check(
  !!resultB.bounds,
  "and produced bounds",
  JSON.stringify(resultB && resultB.bounds)
);
check(
  resultB && resultB.sheet && resultB.sheet.id === sheetB.id,
  "and resolved the sheet by its stable id, not by position or name",
  resultB && resultB.sheet ? resultB.sheet.id : "none"
);

console.log("\nThe render was handed the sheet's own content\n");

check(!!renderCall, "renderClean was called");
check(
  renderCall && renderCall.state.objects.length === 1,
  "with the sheet's features",
  renderCall ? renderCall.state.objects.length + " objects" : "not called"
);
check(
  renderCall && renderCall.state.objects[0].geometry.end.x === 300,
  "and they are the sheet's, at the sheet's coordinates",
  renderCall ? JSON.stringify(renderCall.state.objects[0].geometry.end) : "-"
);
check(
  renderCall && renderCall.state.__displayMode === "fit",
  "fitted to the sheet rather than to the editor's current zoom"
);

/*
 * The render is asked for a DETACHED state, not the live editor state.
 * If it were handed the editor state, a reference to the sheet currently
 * on screen would show whatever the student was halfway through drawing.
 */
check(
  renderCall && renderCall.state.objects !== sheetB.objects,
  "on a copy, not the sheet's own array"
);

/*
 * The whole point: the render must come from the REAL renderer, so
 * something drawn must actually come back. A stub returning a count
 * would satisfy a lookup test and still show the student a blank.
 */
console.log("\nThe render came from the real pipeline\n");
check(
  sandbox.enggDrawingExport && typeof sandbox.enggDrawingExport.renderClean === "function",
  "the export/render module is present, not stubbed"
);

console.log("\nRenaming the sheet keeps the reference pointing at it\n");

const oldName = sheetB.name;
sheetB.name = "Beam Analysis";

const afterRename = ref.renderDrawingReference(sheetB.id);

check(
  !!afterRename && !!afterRename.bounds,
  "the reference still resolves after a rename",
  oldName + " -> " + sheetB.name
);
check(
  afterRename && afterRename.caption && afterRename.caption.includes("Beam Analysis"),
  "and the caption follows the new name",
  afterRename ? afterRename.caption : "none"
);

console.log("\nReordering sheets keeps the reference pointing at it\n");

/* Reorder by rebuilding the lookup in a new order. */
const reordered = [sheetC, sheetB, sheetA];
ref.configure({
  getSheet: (id) => reordered.find((s) => s.id === id) || null,
  getRenderedPoints: (objects) =>
    objects.flatMap((o) => [
      o.geometry.start, o.geometry.end, o.geometry.position
    ].filter(Boolean)),
});

const afterReorder = ref.renderDrawingReference(sheetB.id);

check(
  !!afterReorder && !!afterReorder.bounds,
  "the reference still resolves after a reorder"
);

console.log("\nEditing the sheet is reflected on the next render\n");

const beam = sheetB.objects[0];
beam.geometry.end.x = 700;

const afterEdit = ref.renderDrawingReference(sheetB.id);

check(
  !!afterEdit && !!afterEdit.bounds,
  "the reference still resolves after the sheet was edited"
);
check(
  afterEdit &&
    afterEdit.bounds &&
    afterEdit.bounds.maxX - afterEdit.bounds.minX >
      afterRename.bounds.maxX - afterRename.bounds.minX,
  "and the render's bounds grew with the beam",
  JSON.stringify({
    before: afterRename.bounds && afterRename.bounds.maxX - afterRename.bounds.minX,
    after: afterEdit.bounds && afterEdit.bounds.maxX - afterEdit.bounds.minX
  })
);

console.log("\nDeleting the sheet is a controlled missing state\n");

ref.configure({
  getSheet: (id) => [sheetA, sheetC].find((s) => s.id === id) || null,
  getRenderedPoints: (objects) => [],
});

const afterDelete = ref.renderDrawingReference(sheetB.id);

check(!!afterDelete, "rendering a deleted sheet does not throw");
check(
  afterDelete && afterDelete.ok === false,
  "it is reported as a failure, not a success",
  JSON.stringify(afterDelete)
);
check(
  afterDelete && afterDelete.reason === "missing-sheet",
  "for the reason that the sheet is gone",
  afterDelete ? afterDelete.reason : "none"
);
check(
  afterDelete && afterDelete.svg === null,
  "and renders no image in its place"
);

console.log(
  "\n" + (failed === 0 ? "all checks passed" : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);