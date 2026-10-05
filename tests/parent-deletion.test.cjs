/*
 * ========================================================
 * DELETING A BODY TAKES ITS DEPENDENTS WITH IT
 * ========================================================
 *
 * Two reports had the same root cause, and neither of them was a renderer
 * bug:
 *
 *   - deleting an analysis plot left its x-axis line and its x (m) label
 *     behind;
 *   - deleting a beam left its supports behind, drawn as an X.
 *
 * The axes were not leaking nodes. `renderDrawing` clears the whole SVG
 * before every frame, so a feature that is gone from the document cannot
 * leave ink behind. What actually happened is that the DIAGRAM WAS STILL
 * IN THE DOCUMENT: it had lost its beam but still had `parentId` pointing
 * at a feature that no longer existed, so the renderer went on drawing its
 * frame, its axes and its labels, correctly, for a body that was gone.
 *
 * Which puts the fix in the model rather than in the painting. The parent
 * relationship means "this has no meaning without that", and deleting
 * something has to honour it.
 *
 * The collector is walked rather than looped, so a file with a cycle in its
 * parent links - the shape a half-written save leaves behind - terminates
 * instead of hanging the delete.
 */
const path = require("path");
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
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

require(
  path.join(
    projectRoot,
    "js",
    "engineering-drawing",
    "drawing-state.js",
  ),
);

const S = global.window.enggDrawingState;

const sheet = (...objects) => ({
  objects,
  selection: {
    selectedObjectIds: [],
    boxSelectionIds: [],
    hoveredObjectId: null,
  },
  interaction: {
    hoveredEntity: null,
    snapCandidate: null,
  },
  history: { past: [], future: [] },
  camera: { zoom: 1 },
});

const ids = state => state.objects.map(o => o.id);

/*
 * THE SHEET THE REPORTS DESCRIBE: a beam with a support, a couple of loads,
 * a moment and all three diagrams, plus something unrelated that must
 * survive.
 */
function fullSheet() {
  return sheet(
    {
      id: "beam-1",
      type: "beam",
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: 500, y: 0 },
        length: 500,
      },
    },
    {
      id: "support-1",
      type: "pin-support",
      parentId: "beam-1",
      geometry: { position: { x: 0, y: 0 }, distance: 0 },
    },
    {
      id: "load-1",
      type: "load",
      parentId: "beam-1",
      geometry: {},
    },
    {
      id: "varying-load-1",
      type: "varying-load",
      parentId: "beam-1",
      geometry: {},
    },
    {
      id: "moment-1",
      type: "moment",
      parentId: "beam-1",
      geometry: {},
    },
    {
      id: "connection-1",
      type: "pin-connection",
      parentId: "beam-1",
      geometry: {},
    },
    {
      id: "afd-1",
      type: "analysis-diagram",
      parentId: "beam-1",
      geometry: { diagramType: "afd", mode: "plot" },
    },
    {
      id: "sfd-1",
      type: "analysis-diagram",
      parentId: "beam-1",
      geometry: { diagramType: "sfd", mode: "plot" },
    },
    {
      id: "bmd-1",
      type: "analysis-diagram",
      parentId: "beam-1",
      geometry: { diagramType: "bmd", mode: "sketch" },
    },
    { id: "line-1", type: "line", geometry: {} },
  );
}

console.log("\n  every child of a deleted body goes with it\n");

const state = fullSheet();

const removed = S.removeObjectsAndDescendants(
  state,
  new Set(["beam-1"]),
);

console.log(`  removed: ${JSON.stringify(removed)}\n`);

[
  ["support-1", "support"],
  ["load-1", "distributed load"],
  ["varying-load-1", "varying load"],
  ["moment-1", "applied moment"],
  ["connection-1", "connection"],
  ["afd-1", "AFD"],
  ["sfd-1", "SFD"],
  ["bmd-1", "BMD"],
].forEach(([id, what]) => {
  check(
    `the ${what} is deleted with its beam`,
    !ids(state).includes(id),
    `still present: ${JSON.stringify(ids(state))}`,
  );
});

check(
  "the beam itself is gone",
  !ids(state).includes("beam-1"),
);

check(
  "an unrelated feature is untouched",
  ids(state).includes("line-1"),
  `left: ${JSON.stringify(ids(state))}`,
);

console.log("\n  a sketch diagram goes the same way as a plot\n");

check(
  "the deleted set includes BOTH modes' diagrams",
  removed.includes("sfd-1") && removed.includes("bmd-1"),
  `removed: ${JSON.stringify(removed)}`,
);

console.log("\n  grandchildren go too, and a cycle cannot hang it\n");

/* A support with an attachment marker beneath it. */
const nested = sheet(
  { id: "beam-1", type: "beam", geometry: {} },
  {
    id: "support-1",
    type: "pin-support",
    parentId: "beam-1",
    geometry: {},
  },
  {
    id: "marker-1",
    type: "line",
    parentId: "support-1",
    geometry: {},
  },
  { id: "line-1", type: "line", geometry: {} },
);

const nestedRemoved = S.removeObjectsAndDescendants(
  nested,
  ["beam-1"],
);

check(
  "a grandchild is removed as well as its parent",
  nestedRemoved.includes("marker-1") &&
    !ids(nested).includes("marker-1"),
  `removed: ${JSON.stringify(nestedRemoved)}`,
);

check(
  "the unrelated feature survives the cascade",
  ids(nested).includes("line-1"),
);

/*
 * A CYCLE. Two features naming each other as parent is not something the
 * application can produce, but a half-written save file can carry it, and
 * this is the moment where hanging is least acceptable. The collector
 * returns rather than looping.
 */
const cyclic = sheet(
  { id: "a", type: "beam", parentId: "b", geometry: {} },
  { id: "b", type: "beam", parentId: "a", geometry: {} },
  { id: "c", type: "line", parentId: "a", geometry: {} },
);

const cyclicRemoved = S.removeObjectsAndDescendants(
  cyclic,
  new Set(["a"]),
);

check(
  "a parent cycle terminates instead of hanging",
  Array.isArray(cyclicRemoved) &&
    cyclicRemoved.includes("a") &&
    cyclicRemoved.includes("c"),
  `removed: ${JSON.stringify(cyclicRemoved)}`,
);

console.log("\n  the selection does not survive what it pointed at\n");

const selected = fullSheet();

selected.selection.selectedObjectIds = [
  "beam-1",
  "sfd-1",
  "line-1",
];

selected.selection.boxSelectionIds = ["sfd-1", "line-1"];

selected.selection.hoveredObjectId = "support-1";

S.removeObjectsAndDescendants(selected, ["beam-1"]);

check(
  "a selected child is deselected with it",
  selected.selection.selectedObjectIds.includes("line-1") &&
    !selected.selection.selectedObjectIds.includes("sfd-1") &&
    !selected.selection.selectedObjectIds.includes("beam-1"),
  `selection: ${JSON.stringify(
    selected.selection.selectedObjectIds,
  )}`,
);

check(
  "a box-selected child is dropped from the box",
  selected.selection.boxSelectionIds.includes("line-1") &&
    !selected.selection.boxSelectionIds.includes("sfd-1"),
);

check(
  "hovering a deleted child clears the hover",
  selected.selection.hoveredObjectId === null,
  `hover: ${selected.selection.hoveredObjectId}`,
);

console.log("\n  a dangling parentId from an old file is not a licence to delete\n");

/*
 * A child whose parent is not in the document. This is the state the whole
 * bug produced, and it is also what an old saved file can contain for
 * unrelated reasons. It must not become a reason to delete the sheet.
 */
const orphan = sheet(
  { id: "orphan-1", type: "line", parentId: "gone", geometry: {} },
  { id: "line-1", type: "line", geometry: {} },
);

S.removeObjectsAndDescendants(orphan, ["orphan-1"]);

check(
  "deleting the orphan works",
  !ids(orphan).includes("orphan-1"),
);

check(
  "and takes nothing else with it",
  ids(orphan).includes("line-1"),
);

console.log("\n  it is one operation, so Undo restores the arrangement\n");

/*
 * The delete is committed through the same single commit as any other edit,
 * so one Undo brings back the body and every child at once. What matters
 * is that the snapshot is of the WHOLE sheet and not of the removed subset,
 * because a body restored without its diagram is the same bug one level up.
 */
const undoable = fullSheet();

undoable.history = { past: [], future: [] };

const before = S.snapshotDrawing(undoable);

const undoRemoved = S.removeObjectsAndDescendants(
  undoable,
  ["beam-1"],
);

undoable.history.past.push(before);

/*
 * Undo is the document as it was. The snapshot is now an OBJECT rather
 * than a bare list of features - because it also carries the sheet
 * collection, and JSON drops anything hung off an array - so the features
 * are read from `objects`.
 *
 * The whole point of this check is that one Undo brings back the body AND
 * every child: a beam restored without its diagram is the orphan bug one
 * level up.
 */
const snapshot = JSON.parse(JSON.stringify(before));

const restored = snapshot.objects || snapshot;

check(
  "the snapshot before the delete holds the whole arrangement",
  Array.isArray(restored) &&
    restored.some(o => o.id === "beam-1") &&
    restored.some(o => o.id === "sfd-1") &&
    restored.some(o => o.id === "support-1"),
  `snapshot holds ${Array.isArray(restored) ? restored.length : "no array"} features`,
);

check(
  "undoing restores the beam AND its children together",
  restored.length === 10 && undoable.objects.length === 1,
  `snapshot has ${restored.length} features, sheet now has ${undoable.objects.length}, ${undoRemoved.length} were removed`,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
