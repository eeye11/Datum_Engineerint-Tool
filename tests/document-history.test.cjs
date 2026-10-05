
const { JSDOM } = require("jsdom");

const path = require("path");
const fs = require("fs");

const { controllerSource, loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * CAN THE HISTORY TAKE THE SHEETS WITH IT?
 * ========================================================
 *
 * The editor is the LIVE COPY of the active sheet, and the sheet
 * collection sits beside it in the controller. A snapshot of one sheet's
 * objects therefore cannot express a sheet being added, renamed,
 * reordered or deleted - so the collection has to be handed to the history,
 * and the first attempt at that called three functions of the sheets module
 * that DO NOT EXIST:
 *
 *     enggSheets.cloneCollection(...)
 *     enggSheets.restoreCollection(...)
 *     enggSheets.sheetContent(...)
 *
 * Because a snapshot is taken on the click that PLACES every feature, that
 * throw happened on every tool in the application. Nothing could be drawn
 * at all - not forces, not loads, not anything - and the cause was a line
 * of code whose whole purpose was to improve Undo.
 *
 * So this checks two separate things, because they failed separately:
 *
 *   1. EVERY FUNCTION THE HISTORY CALLS EXISTS. A cross-reference between
 *      what one module asks of another, so a rename cannot leave a call
 *      behind pointing at nothing.
 *
 *   2. A BROKEN SINK COSTS THE SHEET HISTORY AND NOTHING ELSE. A sink that
 *      throws must not be able to stop a feature being placed, because
 *      history is a convenience and drawing is the product.
 */


const projectRoot = path.join(__dirname, "..");
const drawingDir = sourceDir();

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

const read = name =>
  fs.readFileSync(locate(name), "utf8");

const drawingSource = controllerSource();
const sheetsSource = read("sheets.js");
const stateSource = read("drawing-state.js");

/* Comments stripped: they discuss the missing functions by name. */
const code = source =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const drawingCode = code(drawingSource);
const sheetsCode = code(sheetsSource);
const stateCode = code(stateSource);

console.log(
  "\n  every sheet function the history calls actually exists\n",
);

/*
 * EVERY FUNCTION THE SHEETS MODULE EXPORTS.
 *
 * Read from the export list rather than hard-coded, so adding one there
 * without wiring it up - or removing one while something still calls it -
 * is caught rather than discovered by clicking.
 */
const exported = new Set();

const exportBlock = sheetsCode.slice(
  sheetsCode.indexOf("const enggSheets = {"),
);

for (const match of exportBlock.matchAll(/^\s+(\w+),?$/gm)) {
  exported.add(match[1]);
}

check(
  "the sheets module publishes a function list",
  exported.size > 10,
  `found ${exported.size}`,
);

/*
 * EVERY `enggSheets.something(...)` CALL ANYWHERE IN THE DRAWING MODULE.
 *
 * This is the cross-reference that would have caught the outage: three
 * calls, three functions that did not exist, and no test anywhere that
 * asked whether the thing on the left of the dot is on the right of the
 * `=` in the module.
 */
const calls = new Map();

for (const match of drawingCode.matchAll(
  /enggSheets\.(\w+)\s*\(/g,
)) {
  const name = match[1];
  calls.set(name, (calls.get(name) || 0) + 1);
}

check(
  "the drawing module calls the sheets module",
  calls.size > 0,
);

const missing = [...calls.keys()].filter(
  name => !exported.has(name),
);

check(
  "every function the drawing module calls is published",
  missing.length === 0,
  `not published: ${missing.join(", ")}`,
);

/*
 * AND THE SAME QUESTION IN THE OTHER DIRECTION FOR THE STATE MODULE, which
 * the history reaches through `historySinks` rather than by name - so that
 * one is checked by behaviour below instead.
 */

console.log("\n  a broken sink costs the sheet history, nothing else\n");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.window.crypto = {
  randomUUID: () => "test-uuid",
};

loadModule("drawing-state.js");

const S = global.window.enggDrawingState;

const stateWithForce = () => {
  const state = {
    objects: [
      {
        id: "force-1",
        type: "force",
        name: "Point Force 1",
        geometry: {
          start: { x: 0, y: 0 },
          magnitude: 100,
          angle: 30,
        },
      },
    ],
    selection: {
      selectedObjectIds: [],
      boxSelectionIds: [],
      hoveredObjectId: null,
    },
    interaction: {},
    history: { past: [], future: [] },
    camera: { zoom: 1 },
    historySinks: null,
  };

  return state;
};

/*
 * THE EXACT FAILURE THAT BROKE EVERY TOOL.
 *
 * A sink whose capture throws, which is what calling a function that does
 * not exist looks like from here. Placing a feature takes a snapshot, so if
 * this throws the force is never created and no tool in the application
 * works.
 */
{
  const state = stateWithForce();

  S.setHistorySinks(state, {
    capture: () => {
      throw new Error(
        "enggSheets.cloneCollection is not a function",
      );
    },
    restore: () => {},
    adopt: () => {},
  });

  let placed = null;

  try {
    /*
     * What placing a force does: snapshot, then commit. If either throws,
     * the tool stops here and the application is unusable.
     */
    const previous = S.snapshotDrawing(state);

    state.objects.push({
      id: "force-2",
      type: "force",
      geometry: { start: { x: 50, y: 0 }, magnitude: 50, angle: 0 },
    });

    S.commitDrawingChange(state, previous);

    placed = state.objects.length;
  } catch (error) {
    placed = `threw: ${error.message}`;
  }

  check(
    "a force can still be placed when the sink throws",
    placed === 2,
    `got ${placed} - this is what took out every tool in the application`,
  );

  check(
    "and the edit is still undoable",
    S.canUndo(state),
    "history is a convenience, but losing it silently is worse",
  );

  S.undo(state);

  check(
    "and Undo still works",
    state.objects.length === 1,
    `objects after undo: ${state.objects.length}`,
  );
}

/*
 * AND A SINK THAT WORKS IS ACTUALLY USED, so the guard above cannot be
 * satisfied by a snapshot that never asks.
 */
{
  const state = stateWithForce();

  const captured = [];

  /*
   * A SNAPSHOT WITH A REAL SHEET IN IT.
   *
   * `restore` is only reached for an entry that actually carries a
   * collection, so a snapshot holding an empty collection with an active id
   * naming no sheet proves nothing - it exercises the null branch and
   * reports success. The sheet has to be there for Undo to have something
   * to put back.
   */
  const sheet = {
    id: "sheet-1",
    name: "Sheet 1",
    version: 1,
    units: "mm",
    objects: [{ id: "on-sheet-1", type: "line", geometry: {} }],
    snap: { enabled: true, spacing: 1 },
    objectSnap: { enabled: true },
    styleDefaults: { stroke: "#000000", lineWidth: 0.5 },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    grid: { visible: false },
  };

  S.setHistorySinks(state, {
    capture: () => {
      captured.push("capture");

      return {
        version: 1,
        sheets: [sheet],
        activeSheetId: "sheet-1",
      };
    },
    restore: (sheets) => {
      captured.push("restore");

      if (sheets?.sheets?.length) {
        captured.push("restored-1-sheet");
      }
    },
    adopt: () => {
      captured.push("adopt");
    },
  });

  const previous = S.snapshotDrawing(state);

  state.objects.push({ id: "force-9", type: "force", geometry: {} });

  S.commitDrawingChange(state, previous);

  S.undo(state);

  check(
    "the sink is asked for the collection",
    captured.includes("capture"),
    `sink calls: ${JSON.stringify(captured)}`,
  );

  check(
    "and Undo restores it",
    captured.includes("restore") &&
      captured.includes("adopt") &&
      captured.includes("restored-1-sheet"),
    `sink calls: ${JSON.stringify(captured)}`,
  );
}

console.log(
  "\n  the sink is optional\n",
);

{
  const state = stateWithForce();

  /*
   * No sinks at all - every pure test, and the module-load check.
   *
   * A snapshot is an OBJECT, not a list: it also carries the sheet
   * collection, and a property hung off an array is dropped the moment
   * anything JSON-serialises it - which the commit does on every edit.
   */
  const entry = S.snapshotDrawing(state);

  check(
    "a document with no collection still snapshots",
    Boolean(entry && Array.isArray(entry.objects)),
    `got ${JSON.stringify(entry && Object.keys(entry))}`,
  );

  check(
    "and its features survive the commit's JSON round trip",
    entry.objects[0]?.id === "force-1",
    "an array with a property on it would have lost that property here",
  );

  check(
    "and still undoes",
    (() => {
      const previous = S.snapshotDrawing(state);

      state.objects.push({ id: "f2", type: "force", geometry: {} });

      S.commitDrawingChange(state, previous);

      S.undo(state);

      return state.objects.length === 1;
    })(),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
