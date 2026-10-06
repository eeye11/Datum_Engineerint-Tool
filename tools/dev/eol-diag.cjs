const { execSync } = require("child_process");
const fs = require("fs");

const path = "tests/relative-to-scale.test.cjs";
const wt = fs.readFileSync(path, "utf8");
const gt = execSync(`git show HEAD:${path}`, { maxBuffer: 1e9 }).toString(
  "utf8",
);

const crlfMarker = 'if (\r\n            object.type === "load" ||';
const lfMarker = 'if (\n            object.type === "load" ||';

console.log("working tree has CRLF marker:", wt.includes(crlfMarker));
console.log("working tree has LF marker  :", wt.includes(lfMarker));
console.log("HEAD has CRLF marker        :", gt.includes(crlfMarker));
console.log("HEAD has LF marker          :", gt.includes(lfMarker));
console.log("test modified vs HEAD       :", wt !== gt);

/* And what EOL does the WORKING-TREE drawing.js use for that branch? */
const dj = fs.readFileSync("js/app/drawing.js", "utf8");
console.log("drawing.js has CRLF branch  :", dj.includes(crlfMarker));
console.log("drawing.js has LF branch    :", dj.includes(lfMarker));
