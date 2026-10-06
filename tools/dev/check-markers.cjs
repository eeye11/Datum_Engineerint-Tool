const fs = require("fs");
let s = fs.readFileSync("js/app/drawing.js", "utf8");

/* The test reads the file with whatever EOL it has; normalise both ways. */
const lf = s.split("\r\n").join("\n");

const markers = [
  'if (\n            object.type === "load" ||',
  "const anchor = relativeChildAnchor(",
  '"start.x",',
  "mmOf(stationOf(geometry.start, parent)).value",
  "A LOAD'S X IS A STATION, NOT A COORDINATE",
  "A CHILD'S `relative.x` IS ITS STATION",
];

for (const m of markers) {
  console.log(JSON.stringify(m), "->", lf.includes(m));
}

/* Show the region around any "load" branch that DOES exist. */
const i = lf.indexOf('object.type === "load"');
console.log("\nfirst load branch at", i);
console.log(JSON.stringify(lf.slice(i - 60, i + 90)));
