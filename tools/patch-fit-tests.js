/*
 * Replaces the size-based grid filter in the Fit tests with one that
 * names the grid, so the measurement excludes the right element.
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const files = [
  "qa-fit-matrix.mjs",
  "qa-fit-quality.mjs",
  "qa-fitmargins.mjs",
  "qa-fitgap.mjs",
];

const replacements = [
  [
    "return !(r.width >= cr.width - 2 && r.height >= cr.height - 2);",
    'return !el.classList.contains("drawing-engineering-grid");',
  ],
  [
    "return !(\n                          r.width >= cr.width - 2 &&\n                          r.height >= cr.height - 2\n                      );",
    'return !el.classList.contains("drawing-engineering-grid");',
  ],
  [
    "return !(\n            r.width >= sr.width - 2 &&\n            r.height >= sr.height - 2\n          );",
    'return !el.classList.contains("drawing-engineering-grid");',
  ],
  [
    "if (\n            r.width >= svgRect.width - 2 &&\n            r.height >= svgRect.height - 2\n          ) {\n            return;\n          }",
    'if (el.classList.contains("drawing-engineering-grid")) {\n            return;\n          }',
  ],
  [
    "if (\n          r.width >= svgRect.width - 2 &&\n          r.height >= svgRect.height - 2\n        ) {\n          return;\n        }",
    'if (el.classList.contains("drawing-engineering-grid")) {\n          return;\n        }',
  ],
];

files.forEach((name) => {
  const file = path.join(__dirname, name);
  let text = fs.readFileSync(file, "utf8");
  const before = text;

  replacements.forEach(([from, to]) => {
    text = text.split(from).join(to);
  });

  if (text !== before) {
    fs.writeFileSync(file, text);
    console.log("patched " + name);
  } else {
    console.log("no change " + name);
  }
});
