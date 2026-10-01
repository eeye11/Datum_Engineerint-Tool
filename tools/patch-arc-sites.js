/*
 * Routes every "is the active tool the arc?" test through the shared
 * ARC tool set, so Geometry → Arc and Reference Arc are one
 * implementation rather than two that can drift apart.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(
    __dirname,
    "..",
    "js",
    "engineering-drawing",
    "drawing.js"
);

let text = fs.readFileSync(file, "utf8");
const before = text;

/* The multi-line form the code uses, split across lines. */
text = text.replace(
    /drawingState\.activeTool ===\s*\n?\s*"arc"/g,
    "isArcTool()"
);

fs.writeFileSync(file, text);

const count =
    (before.match(/drawingState\.activeTool ===\s*\n?\s*"arc"/g) || [])
        .length;

console.log("replaced " + count + " activeTool arc tests");
