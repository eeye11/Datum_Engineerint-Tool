const fs = require("fs");
const c = fs.readFileSync("js/engineering-drawing/drawing.js", "utf8");

const marker = 'if (\n            object.type === "load" ||';
const s = c.indexOf(marker);
console.log("idx", s);

const e = c.indexOf("\n    const anchor = relativeChildAnchor(", s);
console.log("end idx", e);

const i = c.indexOf('object.type === "load"');
console.log("raw around", JSON.stringify(c.slice(i - 20, i + 60)));
