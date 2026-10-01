const fs = require("fs");
const dir = "js/engineering-drawing";

let corrupted = 0;
for (const file of fs.readdirSync(dir)) {
  const text = fs.readFileSync(`${dir}/${file}`, "utf8");
  const count = (text.match(/\u00C3/g) || []).length;
  if (count) {
    console.log("corrupted:", file, count);
    corrupted += count;
  }
}
console.log("total corrupted sequences:", corrupted);

const drawing = fs.readFileSync(`${dir}/drawing.js`, "utf8");
const tools = fs.readFileSync(`${dir}/tools.js`, "utf8");

const ids = [...tools.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const unhandled = ids.filter((id) => !drawing.includes(`"${id}"`));
console.log(
  "tool ids with no reference in drawing.js:",
  unhandled.join(", ") || "none",
);

const dead = ["construction-line", "centre-line"];
for (const id of dead) {
  const hits = fs
    .readdirSync(dir)
    .filter((f) => fs.readFileSync(`${dir}/${f}`, "utf8").includes(id));
  console.log(`dead id "${id}" appears in:`, hits.join(", ") || "none");
}
