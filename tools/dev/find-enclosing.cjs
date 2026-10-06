const fs = require("fs");
const lines = fs.readFileSync("js/app/drawing.js", "utf8").split(/\r?\n/);

/* Walk backwards from the call site to find the enclosing function. */
let start = 22820;
for (let i = start; i > start - 400; i--) {
  if (/^function \w/.test(lines[i]) || /^\s*function \w/.test(lines[i])) {
    console.log("enclosing:", i + 1, lines[i].trim());
    console.log(
      lines
        .slice(i, i + 22)
        .map((l, k) => `${i + 1 + k}: ${l}`)
        .join("\n"),
    );
    break;
  }
}
