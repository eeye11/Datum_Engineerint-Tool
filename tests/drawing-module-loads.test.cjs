/*
 * THE WHOLE APPLICATION BOOTS.
 *
 * Every other test exercises a module, or a function lifted out of one. None
 * of them can see a fault that only appears when the application starts: a
 * module that throws while it is being evaluated, an import that names
 * something its target does not export, a start-up step that runs before
 * the element it needs exists. Those break the page for every student, and
 * they are invisible to a test of the parts.
 *
 * So this loads the real page - index.html's own markup - into jsdom, then
 * loads the application's entry module, src/main.js, exactly as the browser
 * does, and checks that the editor came up in a working state.
 *
 * jsdom does not execute <script type="module">, so the entry module is
 * loaded here with require() (which Node supports for ES modules). Browser
 * APIs jsdom lacks are stubbed only where start-up needs them.
 */
const { JSDOM } = require("jsdom");
const path = require("path");
const fs = require("fs");

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

const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

const dom = new JSDOM(html, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

const { window } = dom;

/* The globals a browser module sees. */
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.localStorage = window.localStorage;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.KeyboardEvent = window.KeyboardEvent;
global.MouseEvent = window.MouseEvent;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;

/* MathJax is a separately loaded script; the solution renderer only needs it to exist. */
global.MathJax = window.MathJax = {
  typesetClear() {},
  typesetPromise: () => Promise.resolve(),
};

console.log("\n  the application boots from its entry module\n");

let bootError = null;

try {
  require(path.join(projectRoot, "src", "main.js"));
} catch (error) {
  bootError = error;
  console.log(
    `  stack: ${(error.stack || "").split("\n").slice(1, 4).map((s) => s.trim()).join(" | ")}`,
  );
}

check(
  "src/main.js and everything it imports evaluate without throwing",
  !bootError,
  bootError ? `${bootError.name}: ${bootError.message}` : "",
);

if (bootError) {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

console.log("\n  and the editor came up in a working state\n");

const properties = document.getElementById("drawingProperties");

check(
  "the features panel element was found",
  Boolean(properties),
  "the editor could not locate its own panel element",
);

check(
  "the features panel rendered something",
  Boolean(properties && properties.innerHTML.trim().length > 0),
  "the panel is empty after the application loaded",
);

check(
  "the tool list was rendered for the default category",
  document.querySelectorAll(".drawing-tool[data-tool-id]").length > 0,
  "no tool buttons were rendered",
);

check(
  "the sheet tab bar shows the first sheet",
  document.querySelectorAll("#drawingSheetTabs [data-sheet-id], #drawingSheetTabs .drawing-sheet-tab").length > 0,
  "no sheet tab was rendered",
);

check(
  "the automation handles are installed",
  Boolean(window.enggDrawing && window.enggDrawing.state && window.enggDrawingSheets),
  "window.enggDrawing / enggDrawingSheets are missing",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

process.exit(fail ? 1 : 0);
