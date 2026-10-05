/*
 * TEMPORARY PROBE - not a test.
 *
 * Inserts a log at the top of the analysis-diagram branch by LINE NUMBER.
 *
 * An earlier attempt used a text replacement, which silently matched the
 * BEAM's identical finite-guard instead of the diagram's, and the missing
 * log line was then read as "the branch never runs". That was a wrong
 * conclusion drawn from a bad instrument, so this one addresses the line
 * directly and prints what it actually found.
 */

const fs = require("fs");

const FILE = "js/engineering-drawing/renderer.js";

const lines = fs.readFileSync(FILE, "utf8").split("\n");

/*
 * The branch head is the line "const start = geometry.start;" that follows
 * the `entity.type === "analysis-diagram"` test. Finding it by walking
 * forward from the type test, rather than searching the whole file, is
 * what keeps this off the beam's copy.
 */
const typeLine = lines.findIndex((l) =>
  l.includes('entity.type === "analysis-diagram"'),
);

if (typeLine < 0) {
  console.log("probe: analysis-diagram test not found");
  process.exit(1);
}

let target = -1;

for (let i = typeLine; i < typeLine + 40; i++) {
  if (lines[i].includes("const start = geometry.start;")) {
    target = i;
    break;
  }
}

if (target < 0) {
  console.log("probe: branch head not found after the type test");
  process.exit(1);
}

console.log(
  `probe: type test at line ${typeLine + 1}, branch head at line ${target + 1}`,
);

const indent = " ".repeat((lines[target].match(/^\s*/) || [""])[0].length);

lines.splice(
  target,
  0,
  `${indent}console.log(` +
    `"    [PROBE] analysis-diagram branch entered"` +
    `, JSON.stringify({ type: entity.type, start: geometry.start, end: geometry.end, dt: geometry.diagramType }));`,
);

/*
 * And again right before the append, to see how many children the branch
 * actually produced.
 */
const appendLine = lines.findIndex(
  (l) => l.includes("parentSvg.appendChild(svg)") && l.trim() === "}",
);

void appendLine;

fs.writeFileSync(FILE, lines.join("\n"));

console.log("probe installed");
