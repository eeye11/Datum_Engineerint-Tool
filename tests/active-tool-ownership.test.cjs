/*
 * ========================================================
 * THE ACTIVE TOOL OWNS THE CANVAS; A CATEGORY SWITCH CLEANS UP
 * ========================================================
 *
 * Two rules, checked together because both are about the ACTIVE TOOL being the
 * one thing that decides what a press means.
 *
 * DIRECT MANIPULATION
 *   While a tool other than Select is armed, an existing feature cannot be
 *   dragged, nudged or otherwise manipulated. The rule is asked through ONE
 *   predicate, so a new drag entry point cannot quietly bypass it.
 *
 * CATEGORY RESET
 *   Switching top-level category abandons the previous tool, clears any
 *   half-built operation, and activates Select in the new category - leaving
 *   every existing feature exactly as it was.
 */

const fs = require("fs");

const { locate } = require("./helpers/source-path.cjs");

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

const read = (name) => fs.readFileSync(locate(name), "utf8");

const direct = read("direct-manipulation.js");
const drag = read("drag.js");
const selection = read("selection.js");
const toolbar = read("toolbar.js");
const events = read("canvas-events.js");

console.log("\n  ONE predicate decides who may manipulate\n");

check(
  "the rule is stated once, and asks the active tool",
  /export function allowsDirectManipulation/.test(direct) &&
    /activeTool === MANIPULATION_TOOL/.test(direct),
  "several scattered conditions would drift apart",
);

check(
  "the tool it names is Select",
  /MANIPULATION_TOOL = "select"/.test(direct),
);

console.log("\n  every drag entry point asks it\n");

/*
 * The three ways a direct manipulation can begin: a handle/body drag, a
 * magnitude label's own grab, and a box-selection sweep. All three must ask.
 */
check(
  "the handle and body drag asks it, FIRST",
  /export function beginManipulationDrag[\s\S]{0,1200}?allowsDirectManipulation\(\)/.test(
    drag,
  ),
  "a branch reachable before the guard could still move a feature",
);

check(
  "grabbing a magnitude label asks it too",
  /export function beginAnnotationDrag[\s\S]{0,800}?allowsDirectManipulation\(\)/.test(
    selection,
  ),
);

check(
  "and box selection asks the SAME predicate, not its own copy",
  /export function beginSelectionDrag[\s\S]{0,900}?allowsDirectManipulation\(\)/.test(
    selection,
  ),
  "a literal 'select' comparison here is a second place to change",
);

console.log("\n  the pointerdown order lets a creation tool receive the press\n");

/*
 * On the canvas the creation gesture is offered BEFORE direct manipulation, so
 * a press that belongs to a tool is never taken as a drag of what is under it.
 */
check(
  "a creation drag is tried before a manipulation drag",
  events.indexOf("beginCreationDrag(") < events.indexOf("beginManipulationDrag("),
  "the active tool must get the press first",
);

check(
  "and a magnitude label is grabbed only when nothing else wants the press",
  events.indexOf("beginCreationDrag(") < events.indexOf("beginAnnotationDrag(") ||
    /allowsDirectManipulation/.test(selection),
);

console.log("\n  a category switch resets the tool and touches nothing else\n");

check(
  "the category button resets the active tool",
  /resetActiveToolForCategory/.test(toolbar),
);

check(
  "the new category is marked active BEFORE the reset runs",
  toolbar.indexOf('classList.add("active")') <
    toolbar.lastIndexOf("resetActiveToolForCategory()"),
  "the reset re-renders for whichever category the DOM says is current",
);

check(
  "the reset cancels an unfinished construction, preview and all",
  /export function resetActiveToolForCategory[\s\S]{0,2000}?clearInteraction/.test(
    selection,
  ),
);

check(
  "it releases any drag the previous tool was holding",
  /resetActiveToolForCategory[\s\S]{0,1200}?creationDrag = null/.test(selection) &&
    /resetActiveToolForCategory[\s\S]{0,1400}?selectionDrag = null/.test(selection),
);

check(
  "it clears temporary control handles",
  /resetActiveToolForCategory[\s\S]{0,1800}?cancelManipulationDrag/.test(selection),
);

check(
  "and it activates Select in the new category",
  /resetActiveToolForCategory[\s\S]{0,2600}?setActiveTool\(\s*drawingState,\s*"select"\s*\)/.test(
    selection,
  ),
);

console.log("\n  and it does NOT modify the drawing\n");

/*
 * The reset touches interaction state only. It must not delete objects, clear
 * the selection or mutate geometry - a switch is not an edit.
 */
check(
  "no feature is deleted or filtered out",
  !/resetActiveToolForCategory[\s\S]{0,2600}?(removeObjectsAndDescendants|objects\.splice|objects = \[\]|\.filter\()/.test(
    selection,
  ),
  "switching category must leave the drawing intact",
);

check(
  "the selection is left alone",
  !/resetActiveToolForCategory[\s\S]{0,2600}?selectedObjectIds = \[\]/.test(
    selection,
  ),
  "a student inspecting a beam should still have it selected after glancing away",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
