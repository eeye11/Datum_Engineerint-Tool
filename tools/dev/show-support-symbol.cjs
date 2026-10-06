const fs = require("fs");
const lines = fs
  .readFileSync("js/rendering/renderer.js", "utf8")
  .split(/\r?\n/);

const start = lines.findIndex((l) =>
  l.includes("function appendSupportSymbol"),
);
console.log("appendSupportSymbol at", start + 1);

/* Print the whole function body up to the next top-level function. */
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^function \w/.test(lines[i])) {
    end = i;
    break;
  }
}

console.log("lines", start + 1, "..", end);
lines.slice(start, Math.min(end, start + 200)).forEach((l, k) => {
  console.log(`${start + 1 + k}: ${l}`);
});
