const fs = require("fs");

const files = [
  ["js/rendering/renderer.js", 2092],
  ["js/core/geometry/feature-geometry.js", 848],
  ["js/app/drawing.js", 10244],
  ["js/app/drawing.js", 13157],
  ["js/app/drawing.js", 22821],
  ["js/app/drawing.js", 25738],
  ["js/app/drawing.js", 25808],
  ["js/app/drawing.js", 31496],
  ["js/app/drawing.js", 31899],
  ["js/app/drawing.js", 32050],
];

for (const [file, line] of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  console.log(`\n===== ${file} @ ${line} =====`);
  console.log(
    lines
      .slice(line - 1, line + 12)
      .map((l, k) => `${line + k}: ${l}`)
      .join("\n"),
  );
}
