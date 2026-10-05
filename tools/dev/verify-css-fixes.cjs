/*
 * Confirm the five CSS defects are gone, by looking for the DEFECTS
 * themselves rather than trusting a heuristic duplicate-checker.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "..", "css", "engineering-drawing.css");
const lines = fs.readFileSync(file, "utf8").split("\n");

const count = (predicate) => lines.filter(predicate).length;

console.log("\n  The five reported defects\n");

/* 1 & 2. duplicate declarations in the numeric-input rule. */
const start = lines.findIndex((l) =>
  l.includes('.drawing-property-grid input[type="number"],'),
);

const rule = lines.slice(start, start + 24).join("\n");

console.log(
  "  1. min-width declarations in the input rule:",
  (rule.match(/min-width:/g) || []).length,
  "(expect 1)",
);

console.log(
  "  2. width: 100% declarations in the input rule:",
  (rule.match(/width:\s*100%/g) || []).length,
  "(expect 1)",
);

/* 3. The stale duplicate of the selection box. */
console.log(
  "  3. .drawing-selection-box rules:",
  count((l) => l.trim() === ".drawing-selection-box {"),
  "(expect 1)",
);

/* 4. The stale flex override of the properties block. */
console.log(
  "  4. .drawing-properties-block rules:",
  count((l) => l.trim() === ".drawing-properties-block {"),
  "(expect 1)",
);

/* 5. The duplicate tool-message rule. */
console.log(
  "  5. #drawingToolMessage rules:",
  count((l) => l.trim() === "#drawingToolMessage {"),
  "(expect 1)",
);

console.log("\n  Related duplicates found while fixing\n");

console.log(
  "  - .drawing-number-stepper button::before rules:",
  count((l) => l.includes(".drawing-number-stepper button::before")),
  "(expect 1)",
);

console.log(
  "  - .drawing-property-unit rules:",
  count((l) => l.trim() === ".drawing-property-unit {"),
  "(expect 1)",
);

console.log(
  "  - @media (max-width: 720px) blocks:",
  count((l) => l.trim() === "@media (max-width: 720px) {"),
  "(expect 2: one for display, one for layout)",
);

/* The two 720px blocks must not disagree about the workspace columns. */
const templates = lines
  .map((l, i) => ({ l: l.trim(), i }))
  .filter((e) => e.l.startsWith("grid-template-columns:") && e.l.includes("22px"))
  .map((e) => e.i + 1);

console.log(
  "  - grid templates folding both rails, at lines:",
  templates.join(", ") || "(none)",
);

console.log("");