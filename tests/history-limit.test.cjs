/*
 * UNDO HISTORY IS BOUNDED.
 *
 * Every entry is a full copy of the document. Without a limit, a long
 * session holds every copy for as long as the page is open.
 */
const { loadModule } = require("./helpers/source-path.cjs");

global.window = global.window || globalThis;

const model = loadModule("drawing-state.js").default;

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

const state = model.createDrawingState();
const limit = model.HISTORY_LIMIT;

check("the limit is published", Number.isInteger(limit) && limit > 0, `got ${limit}`);

const edits = limit + 50;

for (let i = 0; i < edits; i++) {
  const before = model.snapshotDrawing(state);
  model.addObject(state, model.geometryFactories.point({ x: i, y: 0 }, {}));
  model.commitDrawingChange(state, before);
}

check(
  `after ${edits} edits, ${limit} are kept`,
  state.history.past.length === limit,
  `kept ${state.history.past.length}`,
);

let undone = 0;
while (model.canUndo(state)) {
  model.undo(state);
  undone++;
}

check(`undo walks back ${limit} steps`, undone === limit, `undid ${undone}`);

check(
  "and stops at the oldest kept state, not an empty document",
  state.objects.length === edits - limit,
  `${state.objects.length} objects remain`,
);

let redone = 0;
while (model.canRedo(state)) {
  model.redo(state);
  redone++;
}

check(
  "redo returns to the latest state",
  redone === limit && state.objects.length === edits,
  `redid ${redone}, ${state.objects.length} objects`,
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
