const fs = require("fs");
const lines = fs
  .readFileSync("js/core/geometry/body-frames.js", "utf8")
  .split(/\r?\n/);

const start = lines.findIndex((l) => l.includes("function supportPlacement"));
console.log("supportPlacement at", start + 1);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^    function \w/.test(lines[i])) {
    end = i;
    break;
  }
}
lines
  .slice(start, end)
  .forEach((l, k) => console.log(`${start + 1 + k}: ${l}`));
