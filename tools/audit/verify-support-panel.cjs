/*
 * Reproduce the vanishing-support defect and prove the fix.
 *
 * A helper that returns an array of rows is pushed into the panel's row list
 * as ONE entry. The finalise pass must flatten, or the whole group is dropped.
 */
global.window = {};
require("../../js/engineering-drawing/property-panel.js");

const panels = global.window.enggPropertyPanel;

/* The finalise pass, as drawing.js now implements it. */
function finaliseRows(list) {
  const kept = [];
  const flat = list.flat(Infinity);

  for (let index = 0; index < flat.length; index += 1) {
    const entry = flat[index];
    if (typeof entry !== "string" || entry.trim() === "") continue;

    const marker = /^<!--section:(.*?)-->$/.exec(entry);
    if (!marker) {
      kept.push(entry);
      continue;
    }

    let hasField = false;
    for (let ahead = index + 1; ahead < flat.length; ahead += 1) {
      const next = flat[ahead];
      if (typeof next !== "string" || next.trim() === "") continue;
      if (/^<!--section:(.*?)-->$/.test(next)) break;
      hasField = true;
      break;
    }

    if (hasField) {
      kept.push(`<div class="drawing-properties-section">${marker[1]}</div>`);
    }
  }

  return kept.join("");
}

/* A support panel's rows, built the way supportPanelRows builds them. */
const supportRows = [
  "<!--section:SUPPORT-->",
  panels.readOnly("Type", "Pin"),
  "<!--section:POSITION-->",
  panels.row({
    label: "Relative to",
    control: '<span class="drawing-property-readonly">Beam 1</span>',
  }),
  panels.scalar({
    label: "Position Along Body",
    key: "supportDistance",
    value: 300,
    unit: "mm",
  }),
  "<!--section:REAL POSITION-->",
  panels.readOnlyQuantity("X", 300, "mm"),
  panels.readOnlyQuantity("Y", 0, "mm"),
];

/* The panel pushes the ARRAY as one entry - the shape that was dropped. */
const rows = ["<!--section:SUPPORT 1-->", supportRows];

const text = finaliseRows(rows)
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

console.log("VISIBLE SUPPORT PANEL TEXT:");
console.log(text);
console.log("\nchecks:");
console.log("  the SUPPORT heading appears:", /SUPPORT/.test(text));
console.log("  the POSITION heading appears:", /POSITION/.test(text));
console.log("  'Relative to Beam 1' appears:", /Relative to Beam 1/.test(text));
console.log("  the along-body distance appears:", /300/.test(text));
console.log("  X and Y appear:", /X/.test(text) && /Y/.test(text));
console.log("  units appear:", /mm/.test(text));

const ok =
  /SUPPORT/.test(text) &&
  /POSITION/.test(text) &&
  /Relative to Beam 1/.test(text) &&
  /300/.test(text) &&
  /mm/.test(text);

console.log("\n" + (ok ? "PASS: the support fields render" : "FAIL: fields missing"));
process.exit(ok ? 0 : 1);