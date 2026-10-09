/*
 * ========================================================
 * THE MENU BAR'S BEHAVIOUR, PINNED
 * ========================================================
 *
 * Two defects were found by driving the real bar in a browser, and both are the
 * kind that a source-level test would never have caught - so they are pinned
 * here, on the real component in a real DOM:
 *
 *   1. CLICKING A SECOND LABEL MOVED TO IT. The pointer arriving on a label
 *      while another menu was open moved to that one, and the press that
 *      followed was then undone as a toggle - so a single click on "Edit" while
 *      "File" was open closed BOTH and left none. The hover path now opens the
 *      menu itself rather than synthesising a click, and the press that follows
 *      is treated as the same gesture finishing.
 *
 *   2. THE ITEMS ARE READ WHEN THE MENU OPENS, not when the bar is built. A bar
 *      built from frozen objects showed the state the application had at
 *      start-up for the rest of the session: the grid's item said "Hide Grid"
 *      however many times the grid was toggled.
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

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div class="drawing-canvas"></div>
     <div id="drawingProperties"></div>
     <div id="drawingToolMessage"></div>
     <div id="drawingCoordinates"></div>
     <div id="drawingZoomValue"></div>
     <button id="drawingUndo"></button>
     <button id="drawingRedo"></button>
     <button id="drawingGridToggle" aria-pressed="true"></button>
     <button id="drawingSnapToggle" aria-pressed="true"></button>
     <button id="drawingDimensionsToggle" aria-pressed="true"></button>
     <button id="drawingMagnitudesToggle" aria-pressed="true"></button>
     <div id="drawingToolHeading"></div>
     <div id="drawingToolList"></div>
     <div id="drawingFeaturesBack"></div>
     <div id="menuHost"></div>
   </body></html>`,
  { pretendToBeVisual: true, url: "https://datum.test/" },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Element = dom.window.Element;

[
  "measurement-core.js",
  "quantities.js",
  "dimension-model.js",
  "annotation-model.js",
  "diagram-equations.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
  "renderer.js",
].forEach((name) => require(modulePath(name)));

const enggMenuBar = require(modulePath("menu-bar.js"));

const host = document.getElementById("menuHost");

/*
 * A VISIBILITY FLAG THE "MENU" READS, standing in for the grid's own state.
 * The point of the second check is that the item is derived from something that
 * MOVES, so a frozen value would be caught.
 */
let visible = true;

const MENUS = [
  () => ({
    id: "file",
    label: "File",
    items: [{ id: "new", label: "New", run: () => {} }],
  }),
  () => ({
    id: "view",
    label: "View",
    items: [
      {
        id: "grid",
        label: visible ? "Hide Grid" : "Show Grid",
        run: () => {
          visible = !visible;
        },
      },
    ],
  }),
];

enggMenuBar.installMenuBar(host, MENUS);

const labelFor = (id) => host.querySelector(`.datum-menu-label[data-menu-id="${id}"]`);

const panelFor = (id) => host.querySelector(`.datum-menu-panel-${id}`);

const gridItemLabel = () =>
  host
    .querySelector('.datum-menu-item[data-menu-item="grid"] .datum-menu-item-label')
    ?.textContent;

console.log("\n  the bar is built from the six labels, in order\n");

check(
  "both menus are mounted as labels",
  host.querySelectorAll(".datum-menu-label").length === 2,
);

console.log("\n  clicking a second label MOVES to it, and does not close both\n");

{
  labelFor("file").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check("File opens on a click", Boolean(panelFor("file")));

  /*
   * THE REAL GESTURE: the pointer arrives on View (pointerenter) and THEN the
   * button goes down (click). Reproducing both is what catches the defect -
   * dispatching only the click would have passed before the fix.
   */
  labelFor("view").dispatchEvent(
    new dom.window.MouseEvent("pointerenter", { bubbles: false }),
  );

  check(
    "the pointer arriving on another label opens it",
    Boolean(panelFor("view")),
    "the sweep-across-the-bar behaviour",
  );

  labelFor("view").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check(
    "and File is closed",
    !panelFor("file"),
    "only one dropdown may be open at a time",
  );

  check(
    "while the menu the student clicked STAYS open",
    Boolean(panelFor("view")),
    "a single click must not close both and leave neither",
  );
}

console.log("\n  a SECOND click on the open label closes it\n");

{
  labelFor("view").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check(
    "clicking the open label again closes its menu",
    !panelFor("view"),
    "the label is a toggle when the pointer did not open it",
  );
}

console.log("\n  the items are read WHEN THE MENU OPENS, not when the bar was built\n");

{
  labelFor("view").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check("the grid item is present", Boolean(gridItemLabel()));
  check(
    "and it reads Hide Grid while the grid is up",
    gridItemLabel() === "Hide Grid",
    gridItemLabel(),
  );

  /* Run the command: the flag flips. */
  host
    .querySelector('.datum-menu-item[data-menu-item="grid"]')
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check("running the command flips the state", visible === false);

  /* Reopen: the label must have followed. */
  labelFor("view").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  check(
    "and the reopened menu says Show Grid",
    gridItemLabel() === "Show Grid",
    gridItemLabel() ?? "(no item)",
  );
}

console.log("\n  Escape closes, and opening cannot move the bar\n");

{
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

  check(
    "Escape closes the open menu",
    !host.querySelector(".datum-menu-panel"),
  );

  check(
    "and the labels are still exactly two",
    host.querySelectorAll(".datum-menu-label").length === 2,
    "opening and closing must not rebuild the bar",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
