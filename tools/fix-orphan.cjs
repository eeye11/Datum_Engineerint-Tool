/*
 * Removes the tail left behind by the last patch.
 *
 * The replacement inserted the new loop but the old expression's
 * closing lines - the .map() and .filter() that belonged to the code it
 * replaced - were left in place after the new `return placed;`, so
 * they parsed as a statement beginning with a dot.
 */
const fs = require("fs");

const path = "js/engineering-drawing/smart-dimension.js";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);

const start = lines.findIndex((line) => line.trim() === "return placed;");

if (start === -1) {
  console.log("return placed not found");
  process.exit(1);
}

/* Find the closing brace of the function after the orphaned tail. */
let end = -1;

for (let i = start + 1; i < lines.length; i += 1) {
  if (lines[i] === "  }") {
    end = i;
    break;
  }
}

if (end === -1) {
  console.log("function close not found");
  process.exit(1);
}

const removed = lines.slice(start + 1, end);
const kept = lines.slice(0, start + 1).concat(lines.slice(end));

fs.writeFileSync(path, kept.join("\n"));

console.log(`removed ${removed.length} orphaned lines`);
