/*
 * ========================================================
 * A FIGURE IN THE RENDERED SOLUTION SITS IN ITS PANE
 * ========================================================
 *
 * THE DEFECT: pressing Update Output with a drawing reference put the drawing
 * over the whole page, at the window's size, with nothing to dismiss.
 *
 * THE CAUSE was not sizing, and it was not a modal. The renderer draws into the
 * editor's canvas, so its SVG carries the class `.drawing-renderer`:
 *
 *     .drawing-renderer { position: absolute; inset: 0; width: 100%; height: 100% }
 *
 * which is correct for a canvas - the drawing should fill it. A figure is made
 * by CLONING that SVG, class and all, so the clone arrived ABSOLUTELY POSITIONED
 * with `inset: 0`. That took it out of the frame's layout entirely: it
 * positioned against the nearest positioned ancestor, landed at the top-left of
 * the page, and sized itself against THAT. A drawing asked for at 760x460 was
 * measured at 1280x775 - the window.
 *
 * THE FIX is to undo the editor's own positioning for a figure, so the clone
 * becomes an ordinary block in the figure's flow. The figure then belongs to the
 * pane, which is a scroll box by design: a tall drawing is SCROLLED by the pane,
 * not shrunk to a fraction of the viewport.
 */

const fs = require("fs");
const path = require("path");

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

const css = fs.readFileSync(
  path.join(__dirname, "..", "src", "styles", "editor.css"),
  "utf8",
);

const figureSvgRule = (() => {
  const match = css.match(/\.drawing-reference-frame svg \{[^}]*\}/);
  return match ? match[0] : "";
})();

const frameRule = (() => {
  const match = css.match(/\.drawing-reference-frame \{[^}]*\}/);
  return match ? match[0] : "";
})();

const rendererRule = (() => {
  const match = css.match(/\.drawing-renderer \{[^}]*\}/);
  return match ? match[0] : "";
})();

console.log("\n  the editor's canvas positioning is undone for a figure\n");

check(
  "the renderer's SVG is absolutely positioned - correct for a CANVAS",
  /position:\s*absolute/.test(rendererRule) &&
    /inset:\s*0/.test(rendererRule),
  "the drawing fills the editor's canvas, which is what a canvas is for",
);

check(
  "a FIGURE restates the position, so the clone cannot escape",
  /position:\s*static/.test(figureSvgRule),
  "a cloned canvas SVG kept `position: absolute` and left the layout",
);

check(
  "and clears the inset that pinned it to the page's corner",
  /inset:\s*auto/.test(figureSvgRule),
);

check(
  "the figure is sized by WIDTH, with its height from the aspect ratio",
  /width:\s*100%/.test(figureSvgRule) &&
    /height:\s*auto/.test(figureSvgRule),
);

console.log("\n  the pane scrolls a tall figure; it does not shrink it\n");

check(
  "the frame does NOT cap the figure to a fraction of the viewport",
  !/max-height:\s*\d+vh/.test(figureSvgRule) &&
    !/max-height:\s*\d+vh/.test(frameRule),
  "the Rendered Solution is a scroll box by design - a figure capped at 60vh " +
    "is shrunk to something the pane never asked for",
);

check(
  "the frame does not clip the drawing either",
  !/overflow:\s*hidden/.test(frameRule),
  "clipping would cut the drawing off rather than letting the pane scroll",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}