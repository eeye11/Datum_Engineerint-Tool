/*
 * The Drawing Reference token, tested directly.
 *
 * A reference is a piece of text that points at a sheet, so the one
 * thing that must never be wrong is which sheet it points at. This is
 * checked here without a browser, because the failure it protects
 * against - a reference that resolves to the wrong drawing because the
 * student renamed a tab - is a silent one, and silent failures are
 * worth testing at the level where they happen.
 *
 * The rendering half needs a renderer and is covered by the browser
 * verification; what is pinned down here is that a reference is made
 * of an ID and that everything else about a sheet can change without
 * touching it.
 */
global.window = {};
require("../js/engineering-drawing/sheets.js");
require("../js/engineering-drawing/drawing-reference.js");

const s = global.window.enggSheets;
const r = global.window.enggDrawingReference;

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(
      `  FAIL ${name}\n       expected ${JSON.stringify(expected)}` +
        `\n       actual   ${JSON.stringify(actual)}`
    );
  }
};

console.log("\nA reference");
const doc = s.createCollection();
const fbd = s.addSheet(doc, { name: "Free Body Diagram" });
const reference = r.createReference({
  sheetId: fbd.id,
  caption: "Free Body Diagram"
});
check("is given an identity", typeof reference.referenceId === "string" && reference.referenceId.startsWith("ref_"), true);
check("names the sheet by id, not by name", reference.sheetId, fbd.id);
check("defaults to fitting the drawing", reference.displayMode, "fit");
check("keeps the caption it was given", reference.caption, "Free Body Diagram");

console.log("\nThe token");
const token = r.serializeReference(reference);
check("contains the id", token, `[DRAWING_REFERENCE:${fbd.id}]`);
check("does not contain the name", token.includes("Free Body Diagram"), false);
check(
  "and not the name, even for a sheet actually called that",
  r.serializeReference(
    r.createReference({
      sheetId: s.addSheet(doc, { name: "Sheet 4" }).id,
    }),
  ).includes("Sheet 4"),
  false,
);

/*
 * A token that was really the tab position would come out as a
 * different string once the tabs moved. Comparing the token before and
 * after a reorder is the check that actually means something here -
 * comparing it against the index does not, because a random id can
 * legitimately contain a digit, which is what made an earlier version
 * of this assertion fail for the wrong reason.
 */
const beforeReorder = r.serializeReference(reference);
s.moveSheet(doc, fbd.id, 1);
check(
  "encodes the sheet rather than where it sits",
  r.serializeReference(reference),
  beforeReorder,
);
s.moveSheet(doc, fbd.id, -1);

console.log("\nFinding references in text");
const text = `The free body diagram is\n${token}\nwhich gives the reactions.`;
const found = r.parseReferences(text);
check("one is found", found.length, 1);
check("with the right sheet", found[0].sheetId, fbd.id);
check("and its position in the text", found[0].index, text.indexOf(token));
check("several are found", r.parseReferences(`${token} and ${token}`).length, 2);
check("text with none finds none", r.parseReferences("no figures here").length, 0);
check(
  "a reference with no sheet produces no token",
  r.serializeReference(r.createReference({})),
  ""
);

console.log("\nRenaming the sheet");
s.renameSheet(doc, fbd.id, "FBD - Beam 1");
check("the token is unchanged", r.serializeReference(reference), token);
check(
  "and it still resolves to the same sheet",
  s.sheetById(doc, r.parseReferences(text)[0].sheetId).id,
  fbd.id
);
check(
  "whose new name is what the caption falls back to",
  s.sheetById(doc, fbd.id).name,
  "FBD - Beam 1"
);

console.log("\nReordering the sheets");
const other = s.addSheet(doc, { name: "SFD" });
s.moveSheet(doc, other.id, -1);
check("the token is still unchanged", r.serializeReference(reference), token);
check(
  "and still resolves to the same sheet, wherever it now is",
  s.sheetById(doc, r.parseReferences(text)[0].sheetId).id,
  fbd.id
);
check(
  "which is no longer the sheet the user last made",
  fbd.id === doc.activeSheetId,
  false
);

console.log("\nDuplicating the sheet");
const copy = s.duplicateSheet(doc, fbd.id);
check("the original reference is unaffected", s.sheetById(doc, reference.sheetId).id, fbd.id);
check("and does not resolve to the copy", reference.sheetId === copy.id, false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
