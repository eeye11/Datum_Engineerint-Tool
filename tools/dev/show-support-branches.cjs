const fs = require("fs");
const lines = fs
  .readFileSync("js/rendering/renderer.js", "utf8")
  .split(/\r?\n/);

const find = (needle) => lines.findIndex((l) => l.includes(needle));

for (const needle of [
  'type === "pin-support"',
  'type === "roller-support"',
  'type === "fixed-support"',
  'type === "smooth-support"',
]) {
  const i = find(needle);
  console.log(`\n===== ${needle} @ line ${i + 1} =====`);
  if (i >= 0) {
    console.log(
      lines
        .slice(i, i + 34)
        .map((l, k) => `${i + 1 + k}: ${l}`)
        .join("\n"),
    );
  }
}
