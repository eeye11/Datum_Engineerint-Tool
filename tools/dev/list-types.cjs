const fs = require("fs");
const s = fs.readFileSync("js/core/geometry/measurement-core.js", "utf8");

const types = new Set();
const re = /register\(\s*["']([a-z0-9_-]+)["']/g;
let m;
while ((m = re.exec(s))) types.add(m[1]);

const arrays = [];
const re2 = /\[([^\]]*?)\]\.forEach\(/g;
while ((m = re2.exec(s))) {
  const inside = m[1];
  if (/["'][a-z0-9_-]+["']/.test(inside))
    arrays.push(inside.replace(/\s+/g, " "));
}

console.log("registered directly:");
console.log([...types].sort().join("\n"));
console.log("\nregistered via arrays:");
arrays.forEach((a) => console.log(a));
