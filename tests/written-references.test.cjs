/*
 * ========================================================
 * WRITTEN SOLUTION DRAWING REFERENCES
 * ========================================================
 *
 * The LaTeX source is the source of truth. Insert Reference writes a real
 * command into it; the figure is GENERATED from that command, and is never
 * stored as an image.
 *
 * Two failure classes must stay distinct, because they mean different things to
 * the reader:
 *
 *   .drawing-reference-missing   the sheet is gone, or could not be drawn
 *   .drawing-reference-empty     the sheet really is blank
 *
 * Conflating them is what once produced "this sheet is empty" over a sheet full
 * of geometry - a confident, false claim inside a document meant as evidence.
 * The renderer asks the SHEET whether it has features before saying it is
 * empty, and these checks pin that apart.
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

const written = fs.readFileSync(locate("written-references.js"), "utf8");
const reference = fs.readFileSync(locate("drawing-reference.js"), "utf8");

console.log("\n  the source is the source of truth\n");

check(
  "Insert Reference writes into the LaTeX source",
  /code\.value\s*=\s*\n?\s*code\.value\.slice\(0, start\) \+/.test(written),
  "the command must become real text in the editor",
);

check(
  "and inserts AT THE CURSOR, not at the end",
  /code\.selectionStart/.test(written) &&
    /code\.selectionEnd/.test(written) &&
    !/code\.value\s*\+=\s*token/.test(written),
  "appending would ignore where the student was typing",
);

check(
  "the command carries the sheet's STABLE ID",
  /serializeReference\(/.test(written) &&
    /\[DRAWING_REFERENCE:/.test(reference),
  "a reference must survive the sheet being renamed",
);

check(
  "nothing is written when there is no sheet to refer to",
  /const sheetId = sheetSelect\.value;[\s\S]{0,120}if \(!sheetId\) \{\s*return;/.test(
    written,
  ),
);

console.log("\n  the figure is generated, not stored\n");

check(
  "a figure is rendered from the sheet's CURRENT contents",
  /renderReference\(/.test(written) &&
    /sheetResolver\(sheetId\)/.test(reference),
  "a reference is re-resolved every time, so it cannot go stale",
);

check(
  "no image is captured into the source",
  !/base64|data:image|toDataURL|drawImage/.test(written),
  "a screenshot in the LaTeX would be a copy, not a reference",
);

check(
  "the figure is excluded from the application's own viewport",
  /createRenderState\(sheet, bounds\)/.test(reference),
  "the figure must be the drawing, not the workspace it happens to be viewed in",
);

console.log("\n  a missing sheet and an empty sheet are different things\n");

check(
  "a missing sheet is reported as missing",
  /reason: "missing-sheet"/.test(reference) &&
    /drawing-reference-missing/.test(written),
);

check(
  "an empty sheet is reported as empty",
  /drawing-reference-empty/.test(written),
);

check(
  "emptiness is asked of the SHEET, not inferred from failed measurement",
  /const hasContent = \(sheet\.objects \|\| \[\]\)\.length > 0;/.test(
    reference,
  ) && /if \(!points\.length && hasContent\)/.test(reference),
  "a measurement failure must never be reported as a blank sheet",
);

check(
  "a failed figure does not stop the rest of the solution rendering",
  /try \{[\s\S]{0,200}appendFigure\(output, reference\)/.test(written) &&
    /catch \(error\)/.test(written),
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
