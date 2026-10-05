/*
 * Makes the Fit matrix measure in canvas-relative coordinates.
 *
 * getBoundingClientRect is viewport-relative, and the canvas sits at
 * its own offset - about 220px from the left, where the tool panel is.
 * Comparing an absolute edge against the canvas's width therefore
 * measures the tool panel as if it were drawing content.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "qa-fit-matrix.mjs");

let text = fs.readFileSync(file, "utf8");

const before = text;

/* The box union, made relative to the canvas origin. */
text = text.replace(
  /box = box\s*\n\s*\?\s*\n\s*\{([\s\S]*?)x: Math\.min\(box\.x, r\.left\),\s*\n\s*y: Math\.min\(box\.y, r\.top\),\s*\n\s*r: Math\.max\(box\.r, r\.right\),\s*\n\s*b: Math\.max\(box\.b, r\.bottom\),/,
  `/*
                 * CANVAS-RELATIVE, not viewport-relative.
                 *
                 * getBoundingClientRect is relative to the viewport, and the
                 * canvas sits at an x and y of its own - about 220px from the
                 * left, where the tool panel is. Comparing an absolute right
                 * edge against the canvas's WIDTH therefore measures the tool
                 * panel as if it were drawing content, reporting a large
                 * margin on the left and a negative one on the right.
                 *
                 * Every edge is taken relative to the canvas origin, so the
                 * four gaps mean what they say.
                 */
                const left = r.left - cr.left;
                const top = r.top - cr.top;

                box = box
                  ? {
                      x: Math.min(box.x, left),
                      y: Math.min(box.y, top),
                      r: Math.max(box.r, r.right - cr.left),
                      b: Math.max(box.b, r.bottom - cr.top),`,
);

text = text.replace(
  /:\s*\n\s*\{\s*\n\s*x: r\.left,\s*\n\s*y: r\.top,\s*\n\s*r: r\.right,\s*\n\s*b: r\.bottom,\s*\n\s*\};/,
  `:
                    {
                      x: left,
                      y: top,
                      r: r.right - cr.left,
                      b: r.bottom - cr.top,
                    };`,
);

if (text === before) {
  console.log("no change");
} else {
  fs.writeFileSync(file, text);
  console.log("patched qa-fit-matrix.mjs");
}
