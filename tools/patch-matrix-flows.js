/*
 * Corrects the tool flows in the Fit matrix.
 *
 * Arc, Truss, Cable, Shaft and both loads all say "Select geometry"
 * when armed, which means they ATTACH to existing geometry rather
 * than being placed in free space. The matrix was creating them in
 * empty canvas, so nothing was created and those cases silently
 * tested nothing.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "qa-fit-matrix.mjs");

let text = fs.readFileSync(file, "utf8");

/* Each entry: a label, and the body that must exist first. */
const attaching = [
  {
    label: "4. arc",
    body: 'await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);',
    category: "GEOMETRY",
    tool: "arc",
    a: [0.3, 0.5],
    b: [0.7, 0.5],
  },
  {
    label: "6. truss",
    body: 'await span("GEOMETRY", "line", [0.2, 0.3], [0.8, 0.3]);',
    category: "STATICS",
    tool: "truss",
    a: [0.5, 0.3],
    b: [0.5, 0.7],
  },
  {
    label: "7. cable",
    body: 'await span("GEOMETRY", "line", [0.2, 0.3], [0.8, 0.3]);',
    category: "STATICS",
    tool: "cable",
    a: [0.5, 0.3],
    b: [0.5, 0.7],
  },
  {
    label: "8. shaft",
    body: 'await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);',
    category: "STATICS",
    tool: "shaft",
    a: [0.5, 0.5],
    b: [0.5, 0.25],
  },
  {
    label: "10. distributed load",
    body: 'await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);',
    category: "STATICS",
    tool: "load",
    a: [0.5, 0.5],
    b: [0.5, 0.25],
  },
  {
    label: "11. varying distributed load",
    body: 'await span("GEOMETRY", "line", [0.2, 0.5], [0.8, 0.5]);',
    category: "STATICS",
    tool: "varying-load",
    a: [0.5, 0.5],
    b: [0.5, 0.25],
  },
];

let replaced = 0;

attaching.forEach((entry) => {
  const label = entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /*
   * The case, from its clearSheet() to its record().
   */
  const pattern = new RegExp(
    '    await clearSheet\\(\\);[\\s\\S]*?await record\\("' + label + '"\\);',
  );

  if (!pattern.test(text)) {
    console.log("no match: " + entry.label);
    return;
  }

  const body =
    "    await clearSheet();\n" +
    "    " +
    entry.body +
    "\n" +
    '    await arm("' +
    entry.category +
    '", "' +
    entry.tool +
    '");\n' +
    "    await at(" +
    entry.a[0] +
    ", " +
    entry.a[1] +
    ");\n" +
    "    await at(" +
    entry.b[0] +
    ", " +
    entry.b[1] +
    ");\n" +
    "    await press(FIT);\n" +
    '    await record("' +
    entry.label +
    '");';

  text = text.replace(pattern, body);
  replaced += 1;
});

fs.writeFileSync(file, text);
console.log("replaced " + replaced + " of " + attaching.length);
