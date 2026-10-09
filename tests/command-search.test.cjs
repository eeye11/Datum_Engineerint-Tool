/*
 * ========================================================
 * COMMAND SEARCH FINDS COMMANDS BY THE WORDS PEOPLE TYPE
 * ========================================================
 *
 * The requirement names four searches that must work:
 *
 *   "Trim"          finds the Trim drawing tool
 *   "Print"         finds File > Print
 *   "Dark Mode"     finds the Application Theme setting
 *   "Fit to Screen" finds the View command
 *
 * THREE OF THOSE ARE THE COMMAND'S OWN NAME, and the fourth is not: the theme
 * lives inside Drawing Settings, so nothing on a menu says "dark mode". A search
 * that only read menu labels could not find it - which is the defect these
 * checks exist to prevent.
 *
 * AND EVERY RESULT MUST RUN SOMETHING. A result built from a command that has no
 * implementation would be a result that does nothing, which teaches the student
 * that the search cannot be trusted.
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

const search = require(modulePath("command-search.js"));

const labels = (query) => search.searchCommands(query).map((r) => r.label);

console.log("\n  the four searches the specification names\n");

check(
  "Trim finds the Trim tool",
  labels("Trim").some((l) => /Trim/.test(l)),
  labels("Trim").join(" | "),
);

check(
  "Print finds File > Print",
  labels("Print").some((l) => /Print/.test(l)),
  labels("Print").join(" | "),
);

check(
  "Fit to Screen finds the View command",
  labels("Fit to Screen").some((l) => /Fit/.test(l)),
  labels("Fit to Screen").join(" | "),
);

check(
  "Dark Mode finds the theme setting",
  labels("Dark Mode").some((l) => /Settings|Theme|Appearance/.test(l)),
  labels("Dark Mode").join(" | ") || "(no results)",
);

console.log("\n  and the aliases reach the settings people look for\n");

for (const [query, expected] of [
  ["dark", /Settings/],
  ["theme", /Settings/],
  ["light mode", /Settings/],
  ["units", /Settings/],
  ["snapping", /Snapping|Settings/],
  ["keyboard", /Shortcuts/],
  ["shortcuts", /Shortcuts/],
  ["measure", /Measure|Inspection/],
  ["inspect", /Inspect|Inspection/],
]) {
  const found = labels(query).some((l) => expected.test(l));

  check(
    `"${query}" reaches ${expected.source}`,
    found,
    labels(query).join(" | "),
  );
}

console.log("\n  a result is a REAL command, not a label\n");

{
  const results = search.searchCommands("save");

  check("there is a Save result", results.length > 0);

  check(
    "and it carries a function to run",
    results.every((r) => typeof r.run === "function"),
    "a result that cannot run is a result that does nothing",
  );

  check(
    "and says which menu it lives in",
    results.every((r) => typeof r.menu === "string" && r.menu.length > 0),
  );
}

console.log("\n  one row per command\n");

{
  /*
   * An alias and a label match can both point at the same command. Two
   * identical results would look like a bug.
   */
  const ids = search.searchCommands("drawing").map((r) => r.id);

  check(
    "the same command is not listed twice",
    new Set(ids).size === ids.length,
    ids.join(", "),
  );
}

console.log("\n  and a query that matches nothing returns nothing\n");

{
  check(
    "an empty query returns no results",
    search.searchCommands("").length === 0,
  );

  check(
    "and a nonsense query returns no results",
    search.searchCommands("zzzzqqq").length === 0,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
