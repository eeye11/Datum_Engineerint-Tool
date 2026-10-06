const fs = require("fs");
const lf = fs
  .readFileSync("js/app/drawing.js", "utf8")
  .split("\r\n")
  .join("\n");

/* Where does the load-station panel code actually live now? */
const needles = [
  'object.type === "load"',
  "mmOf(stationOf(geometry.start",
  "stationOf(geometry.start",
  "relativeChildAnchor(",
  "A LOAD'S X IS A STATION",
];

for (const n of needles) {
  let i = -1;
  let count = 0;
  while ((i = lf.indexOf(n, i + 1)) >= 0) count++;
  console.log(JSON.stringify(n), "count =", count, "first @", lf.indexOf(n));
}

console.log("\n--- around the first load branch ---");
const i = lf.indexOf('object.type === "load"');
console.log(lf.slice(i - 120, i + 200));
