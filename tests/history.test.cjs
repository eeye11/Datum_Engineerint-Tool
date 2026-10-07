/*
 * ========================================================
 * SELECT ALL, DELETE, AND THE SHAPE OF HISTORY
 * ========================================================
 *
 *   Ctrl+A       selects every feature on the sheet
 *   Delete       removes the selection
 *   Undo/Redo    restore and re-apply, promptly
 *
 * THE HISTORY RULE, which is what makes Undo usable at all: ONE COMPLETED
 * ACTION IS ONE ENTRY. A drag mutates geometry on every pointermove and commits
 * once, on release, so a drag is a single step. If each mutation were recorded,
 * undoing a short drag would take a hundred presses.
 *
 * This is checked against the real state model, which is where the rule is
 * enforced.
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;
global.Element = dom.window.Element;

const state = require(modulePath("drawing-state.js")).default;

function makeState(count) {
  const st = state.createDrawingState();

  for (let index = 0; index < count; index += 1) {
    const line = state.geometryFactories.line(
      { x: index * 50, y: 0 },
      { x: index * 50 + 30, y: 40 },
      { style: {} },
    );

    line.id = `line_${index}`;

    st.objects.push(line);
  }

  return st;
}

console.log("\n  one completed action is one history entry\n");

{
  const st = makeState(1);

  const object = st.objects[0];

  const snapshot = state.snapshotDrawing(st);

  /*
   * A drag: many mutations, then ONE commit. This is exactly what
   * drag.js does, and the history must see only the commit.
   */
  const before = st.history.past.length;

  for (let step = 1; step <= 40; step += 1) {
    object.geometry.start = { x: step, y: step };
    object.geometry.end = { x: step + 30, y: step + 40 };
  }

  state.commitDrawingChange(st, snapshot);

  check(
    "a 40-step drag is ONE undo entry",
    st.history.past.length - before === 1,
    `added ${st.history.past.length - before}`,
  );

  check(
    "and the drag's end state is what is stored",
    st.objects[0].geometry.start.x === 40,
  );

  state.undo(st);

  check(
    "one Undo returns the geometry to where it started",
    st.objects[0].geometry.start.x === 0,
    `start.x is ${st.objects[0].geometry.start.x}`,
  );

  state.redo(st);

  check("and one Redo re-applies it", st.objects[0].geometry.start.x === 40);
}

console.log("\n  selection and deletion\n");

{
  const st = makeState(3);

  state.selectObjects(
    st,
    st.objects.map((object) => object.id),
  );

  check(
    "every feature can be selected at once",
    st.selection.selectedObjectIds.length === 3,
    `selected ${st.selection.selectedObjectIds.length}`,
  );

  const snapshot = state.snapshotDrawing(st);

  const ids = st.objects.map((object) => object.id);

  state.removeObjectsAndDescendants(st, ids);

  check("deleting the selection empties the sheet", st.objects.length === 0);

  check(
    "and clears the selection, so nothing points at a deleted feature",
    st.selection.selectedObjectIds.length === 0,
  );

  state.commitDrawingChange(st, snapshot);

  check(
    "the delete is ONE undo entry",
    st.history.past.length === 1,
    `${st.history.past.length} entries`,
  );

  state.undo(st);

  check(
    "one Undo brings all three back",
    st.objects.length === 3,
    `${st.objects.length} objects`,
  );
}

console.log("\n  history is bounded, and saving is not an edit\n");

{
  const st = makeState(1);

  for (let index = 0; index < state.HISTORY_LIMIT + 25; index += 1) {
    const snapshot = state.snapshotDrawing(st);

    st.objects[0].geometry.start = { x: index, y: 0 };

    state.commitDrawingChange(st, snapshot);
  }

  check(
    "the history does not grow without bound",
    st.history.past.length === state.HISTORY_LIMIT,
    `${st.history.past.length} entries for ${state.HISTORY_LIMIT + 25} edits`,
  );

  check(
    "and Undo is still available after a long session",
    state.canUndo(st) === true,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}

void dom;
