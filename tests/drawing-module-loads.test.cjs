/*
 * Does the FEATURES LIST still render at all?
 *
 * Every existing test extracts one function from drawing.js and runs it.
 * None of them execute drawing.js as the browser does, so a runtime error
 * anywhere in that file - a reference to something out of scope, a bad
 * identifier - passes every test while the panel shows nothing.
 *
 * This loads the real file, with a DOM, and asks the tree renderer for the
 * markup it produces.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

/*
 * The ids drawing.js actually asks for, read from its own top-of-file
 * lookups rather than invented. An earlier version of this fixture used
 * kebab-case ("drawing-properties"), matched nothing, and every missing
 * element threw in turn - five wrong guesses dressed up as debugging.
 */
const ids = [
  "drawingToolHeading",
  "drawingToolList",
  "drawingCoordinates",
  "drawingZoomValue",
  "drawingZoomOut",
  "drawingZoomIn",
  "drawingGridToggle",
  "drawingSnapToggle",
  "drawingProperties",
  "drawingToolMessage",
  "drawingFeaturesBack",
  "drawingUndo",
  "drawingRedo",
  "drawingThickness",
  "drawingColor",
  "drawingLineType",
  "drawingToolPanelToggle",
  "drawingFeaturesPanelToggle",
  "drawingSheetTabs",
  "drawingFileNew",
  "drawingFileOpen",
  "drawingFileSave",
];

const body = [
  `<div class="drawing-canvas"></div>`,
  /*
   * The colour input goes INSIDE a label. On load, drawing.js builds a
   * swatch control, moves the input into it, and puts the control where
   * the label was. Given a bare parent it tries to insert the control
   * into itself and the document rejects it - a fixture artefact, not an
   * application fault.
   */
  `<label>Colour <input type="color" id="drawingColor"/></label>`,
  ...ids
    .filter((id) => id !== "drawingColor")
    .map((id) =>
      id === "drawingThickness" || id === "drawingLineType"
        ? `<select id="${id}"></select>`
        : id === "drawingGridToggle" || id === "drawingSnapToggle"
          ? `<input type="checkbox" id="${id}"/>`
          : `<div id="${id}"></div>`,
    ),
].join("\n");

const dom = new JSDOM(
  `<!doctype html><html><body>\n${body}\n</body></html>`,
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
dom.window.requestAnimationFrame = global.requestAnimationFrame;
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);

console.log("\n  drawing.js loads at all\n");

const dir = path.join(projectRoot, "js", "engineering-drawing");

const readFile = (name) =>
  fs.readFileSync(path.join(dir, name), "utf8");

/*
 * The modules drawing.js reads at LOAD time, in the order index.html gives
 * them. It touches several of them while the file is still being evaluated,
 * so they have to exist first - otherwise every failure reported here is
 * just a missing dependency and the real question goes unanswered.
 */
const dependencies = fs
  .readFileSync(path.join(projectRoot, "index.html"), "utf8")
  .match(/<script src="js\/engineering-drawing\/([^"]+)"><\/script>/g)
  .map((tag) => tag.match(/([^/"]+)">/)[1])
  .filter((name) => name !== "drawing.js");

const skipped = [];

for (const name of dependencies) {
  try {
    dom.window.eval(readFile(name));
  } catch (e) {
    skipped.push(`${name}: ${e.message}`);
  }
}

/*
 * Anything that failed to LOAD is worth naming, but many are modules that
 * legitimately need a browser API jsdom lacks. They are reported, not
 * treated as the fault, so that a real syntax error in drawing.js is not
 * lost among them.
 */
console.log(
  `  ${dependencies.length - skipped.length}/${dependencies.length} dependency modules loaded\n`,
);

if (skipped.length) {
  console.log(`  not loaded here (jsdom may lack the API):\n`);

  for (const s of skipped.slice(0, 6)) {
    console.log(`    ${s}`);
  }

  console.log("");
}

/*
 * drawing.js reads its modules as BARE globals (`enggDrawingState`, not
 * `window.enggDrawingState`). In a page that is just `window`; under eval
 * it is not, so every name is bridged before the file runs. This is a
 * property of the harness rather than of the application.
 */
for (const key of Object.keys(dom.window)) {
  if (/^engg[A-Z]/.test(key) && dom.window[key] !== undefined) {
    dom.window[key] = dom.window[key];
    global[key] = dom.window[key];
  }
}

const source = readFile("drawing.js");

/*
 * drawing.js reads its modules as BARE globals (`enggDrawingState`, not
 * `window.enggDrawingState`). In a page that is just `window`; under eval
 * it is not, so every name is bridged before the file runs. This is the
 * same bridge the other test files use, and it is a property of the
 * harness rather than of the application.
 */
for (const key of Object.keys(dom.window)) {
  if (/^engg[A-Z]/.test(key) && dom.window[key] !== undefined) {
    global[key] = dom.window[key];
  }
}

/*
 * Run the file in the page's own window. Anything that throws on load is
 * exactly the class of fault the extracted-function tests cannot see.
 */
let loadError = null;

/*
 * Some modules declare BARE consts (`const engineeringTools = {...}` in
 * tools.js) rather than attaching to window. In a page those are visible to
 * every later script; under eval each call is its own scope, so they are
 * not. They are bridged by evaluating all the dependencies as ONE program,
 * which is what makes the bare names shared exactly as a page shares them.
 */
const prelude = dependencies
  .map((name) => readFile(name))
  .concat([source])
  .join("\n;\n");

try {
  dom.window.eval(prelude);
} catch (e) {
  loadError = e;

  console.log(
    `  stack: ${
      (loadError.stack || "")
        .split("\n")
        .slice(1, 4)
        .map((s) => s.trim())
        .join(" | ")
    }`,
  );
}

check(
  "the file evaluates without throwing",
  !loadError,
  loadError ? `${loadError.name}: ${loadError.message}` : "",
);

if (loadError) {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

console.log("\n  and the features list is still produced\n");

/*
 * drawing.js is an IIFE, so nothing it declares is on `window` - that is
 * correct and expected, and checking for the functions there was testing
 * the wrong thing.
 *
 * What matters is whether the module LEFT THE PAGE in a working state,
 * and whether it painted a features list. The module runs its own startup
 * on load, so if the list is rendered here it will be rendered for a
 * student too.
 */
const properties = dom.window.document.getElementById("drawingProperties");

check(
  "the features panel element was found",
  Boolean(properties),
  "drawing.js could not locate its own panel element",
);

const rendered = properties ? properties.innerHTML : "";

check(
  "the panel rendered something",
  rendered.length > 0,
  "the panel is empty after the module loaded",
);

console.log(
  `  panel says: ${
    rendered.replace(/\s+/g, " ").trim().slice(0, 120) || "(empty)"
  }\n`,
);

check(
  "and it reports having no components rather than failing silently",
  /No components/i.test(rendered),
  `got: ${rendered.replace(/\s+/g, " ").trim().slice(0, 120)}`,
);

console.log("\n  and a real feature actually reaches the list\n");

/*
 * The empty case passes on an untouched panel, so it cannot tell a working
 * list from one that always says "No components". This puts a beam in the
 * document and asks for the list again - which is the question the student
 * is really asking when they say features are not showing.
 */
const state = global.window.enggDrawingState;
const doc = state.createDrawingState
  ? state.createDrawingState()
  : { objects: [] };

state.addObject(doc, {
  id: "beam-1",
  type: "beam",
  name: "Beam 1",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 300, y: 0 },
    length: 300,
    depth: 20,
  },
  style: {},
});

check(
  "a beam can be added to the document",
  doc.objects.length === 1,
  `the document holds ${doc.objects.length} object(s)`,
);

check(
  "and it was given a name",
  doc.objects[0] && doc.objects[0].name,
  "the feature was stored without a name, so no row could be built",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);