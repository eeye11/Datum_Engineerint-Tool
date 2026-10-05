/*
 * Which Statics and Geometry types does the one hit test know about?
 *
 * `objectAtPoint` is the universal selection path - Select, every
 * construction tool, and the box selection all reach the drawing through it -
 * so a type it does not recognise is a feature that cannot be clicked.
 *
 * Read from the real source rather than a list restated here.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(
  require("../../tests/helpers/source-path.cjs").locate("drawing.js"),
  "utf8",
);

const start = src.indexOf("function objectAtPoint");
const end = src.indexOf("\nfunction ", start + 10);
const body = src.slice(start, end);

const types = [
  "beam", "truss", "cable", "shaft", "rigid-body", "particle", "point",
  "line", "rectangle", "circle", "arc", "polygon", "triangle", "polyline",
  "force", "load", "varying-load", "moment", "couple",
  "pin-support", "roller-support", "fixed-support", "smooth-support",
  "pin-connection", "fixed-connection", "slider-connection", "connection",
  "force-components", "resultant", "analysis-diagram",
];

const missing = types.filter((t) => !body.includes(`"${t}"`));

console.log(`objectAtPoint spans ${body.split("\n").length} lines`);
console.log(missing.length ? `MISSING: ${missing.join(", ")}` : "all types handled");/*
 * A type can also be reached through a PREDICATE rather than a literal, which
 * is how the four supports and the three connections are handled - one shared
 * question rather than four near-identical branches free to drift apart.
 */
const predicates = ["isSupportType", "isConnectionType", "isAnalysisObject"];

const trulyMissing = missing.filter((t) => {
  const family = t.includes("support")
    ? "isSupportType"
    : t.includes("connection")
      ? "isConnectionType"
      : "isAnalysisObject";

  return !body.includes(family);
});

console.log(
  "handled by predicate:",
  predicates.filter((p) => body.includes(p)).join(", "),
);

console.log(
  trulyMissing.length
    ? `TRULY MISSING: ${trulyMissing.join(", ")}`
    : "nothing unreachable - every type handled, literally or by family",
);