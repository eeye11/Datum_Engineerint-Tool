/*
 * Routes both arc commit paths through referenceArcOptions(), so a
 * Reference Arc gets its construction state whichever of the two arc
 * construction modes it was drawn with.
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

/* The options block the arc factory was given. */
const pattern =
    /\{\s*\n\s*style:\s*\{\s*\n\s*\.\.\.drawingState\.styleDefaults\s*\n\s*\},\s*\n\s*\n\s*engineering:\s*\n\s*currentEngineeringMetadata\(\)\s*\n\s*\}/g;

const matches = text.match(pattern) || [];
text = text.replace(pattern, "referenceArcOptions()");

fs.writeFileSync(file, text);

console.log(
    "replaced " +
        matches.length +
        " arc option blocks"
);
